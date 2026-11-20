import { normalizeRoomMode, normalizeRoomServer } from "./lobby-options.mjs";
import { roomConfig } from "./config";
import { randomUUID } from "node:crypto";
import {
  allPlayers,
  getStartBlockers,
  transitionLobby,
  type Action,
  type LobbyState,
} from "./engine";
import { roomStatusForPhase, type Room } from "../room-mock-data";
import { applyDotaBotUpdate } from "./dota";
import { applyDemoRoomAction, type DemoRoomAction } from "./demo";
import { closeCommends } from "./recognition";
import { registerParticipants, recordCompletedMatch } from "./match-ledger";
import type { Team } from "./engine";
import type { Player } from "../competitive";
import {
  hashRoomPassword,
  verifyRoomPassword,
  type RoomCredential,
} from "./privacy";
import { readParticipant } from "./match-ledger";
import { pointsConfig } from "../progression/config";
import { voidMatchPredictions } from "../progression/server";
import { getRoomRole } from "../dota-roles";
import { activeRoomConflictCode, isActiveRoomPhase } from "./ownership";

export type ReadySession = {
  id: string;
  roomId: string;
  tokens: Record<string, string>;
};
export type ReadySnapshot = {
  state: LobbyState;
  room: Room;
  sessionId: string;
  revision: number;
  serverNow: number;
  session?: ReadySession;
};
export type ReadyCommand =
  | Action
  | { type: "demoCloseCommends" }
  | { type: "privacy"; isPrivate: boolean; password?: string }
  | { type: "demoAllReady" | "demoNextReady" }
  | { type: "demoRoom"; action: DemoRoomAction }
  | {
      type: "demoLifecycle";
      attemptId: string;
      event: "lobbySent" | "gameStarted" | "gameFinished";
      winningTeam?: Team;
    };
type StoredRoom = {
  state: LobbyState;
  room: Room;
  revision: number;
  tokens: Record<string, string>;
  expiresAt: number;
  listeners: Set<() => void>;
  credential?: RoomCredential;
  failedJoins?: Map<string, { count: number; until: number }>;
};
const shared = globalThis as typeof globalThis & {
  draftoryReadyRooms?: Map<string, StoredRoom>;
  draftoryReadyRoomIds?: Map<string, string>;
};
const rooms = (shared.draftoryReadyRooms ??= new Map<string, StoredRoom>());
const roomIds = (shared.draftoryReadyRoomIds ??= new Map<string, string>());
const time = (now: number) =>
  new Date(now).toLocaleTimeString("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });

export class ActiveRoomConflict extends Error {
  readonly code = activeRoomConflictCode;
  constructor(readonly room: Room) {
    super("Ya tienes una sala activa.");
  }
}
export function findActiveOwnedRoom(
  creatorId: string,
  now: number,
): Room | null {
  const stored = [...rooms.values()].find(
    (room) =>
      room.expiresAt > now &&
      room.state.hostId === creatorId &&
      isActiveRoomPhase(room.state.phase),
  );
  return stored
    ? {
        ...stored.room,
        hostId: creatorId,
        players: allPlayers(stored.state).length,
        status: roomStatusForPhase(stored.state.phase),
      }
    : null;
}

// Shared, in-memory DEMO service. Production replaces token provisioning with
// authenticated Steam sessions and persists these transactions in the database.
export function createReadySession(
  state: LobbyState,
  room: Room,
  actorId: string,
  now: number,
  ownerToken?: string,
  initializeOnly = false,
): ReadySession {
  for (const [id, stored] of rooms)
    if (stored.expiresAt <= now) {
      rooms.delete(id);
      if (roomIds.get(stored.state.roomId) === id)
        roomIds.delete(stored.state.roomId);
    }
  if (
    !state ||
    !room ||
    state.roomId !== room.id ||
    actorId !== state.hostId ||
    !allPlayers(state).some((player) => player.id === actorId)
  )
    throw new Error("Solo el creador puede abrir el Ready Check de su sala.");
  const existingId = roomIds.get(room.id);
  if (existingId) {
    const existing = rooms.get(existingId)!;
    // Duplicate submissions never overwrite the authoritative room or restart its clock.
    if (existing.state.hostId !== actorId)
      throw new Error("La sala ya tiene otro creador.");
    if (!ownerToken || existing.tokens[actorId] !== ownerToken) {
      if (isActiveRoomPhase(existing.state.phase))
        throw new ActiveRoomConflict(findActiveOwnedRoom(actorId, now)!);
      throw new Error("Usa la sesión de esta sala para reconectar.");
    }
    return { id: existingId, roomId: room.id, tokens: { ...existing.tokens } };
  }
  // No await between this check and insertion: atomic within the DEMO process.
  // Production uses the transaction/partial unique index in creation-repository.
  const owned = findActiveOwnedRoom(actorId, now);
  if (owned) throw new ActiveRoomConflict(owned);
  if (rooms.size >= 1000) throw new Error("Demasiadas salas demo activas.");
  if (
    (!initializeOnly && getStartBlockers(state).length) ||
    (initializeOnly && state.phase !== "WAITING") ||
    allPlayers(state).length > 200 ||
    new Set(allPlayers(state).map((player) => player.id)).size !==
      allPlayers(state).length ||
    allPlayers(state).some(
      (player) =>
        !player.id ||
        !player.name ||
        !Number.isInteger(player.mmr) ||
        player.mmr < 0,
    )
  )
    throw new Error(
      "La sala no está lista o contiene participantes inválidos.",
    );
  const initial = structuredClone(state);
  for (const zone of ["radiant", "dire", "bench"] as const)
    initial[zone] = initial[zone].map((player) => {
      const current = readParticipant(player.id);
      return {
        ...player,
        roomRole: getRoomRole(player),
        ...(current
          ? { elo: current.elo, xp: current.xp, level: current.level }
          : {}),
      };
    });
  const next = initializeOnly
    ? initial
    : transitionLobby(initial, { type: "start" }, actorId, time(now), now);
  const id = randomUUID();
  const tokens = Object.fromEntries(
    allPlayers(next).map((player) => [player.id, randomUUID()]),
  );
  const metadata: Room = {
    id: room.id,
    title: room.title,
    host: room.host,
    hostId: actorId,
    players: allPlayers(next).length,
    status: roomStatusForPhase(next.phase),
    mode: room.mode,
    region: room.region,
    formation: room.formation,
    isPrivate: !!room.isPrivate,
  };
  rooms.set(id, {
    state: next,
    room: metadata,
    revision: 1,
    tokens,
    expiresAt: now + 6 * 60 * 60_000,
    listeners: new Set(),
  });
  registerParticipants(allPlayers(next));
  roomIds.set(room.id, id);
  return { id, roomId: room.id, tokens: { ...tokens } };
}
function lookup(id: string, token: string, now: number) {
  const room = rooms.get(id);
  if (!room || room.expiresAt <= now)
    throw new Error("La sesión demo ha expirado. Vuelve a crear la sala.");
  const actor = Object.keys(room.tokens).find(
    (playerId) => room.tokens[playerId] === token,
  );
  if (!actor || !allPlayers(room.state).some((player) => player.id === actor))
    throw new Error("No perteneces a esta sala.");
  return { room, actor };
}
function expire(room: StoredRoom, now: number) {
  if (
    room.state.phase === "READY_CHECK" &&
    room.state.readyCheck &&
    now >= room.state.readyCheck.expiresAt
  ) {
    room.state = transitionLobby(
      room.state,
      { type: "expireReadyCheck" },
      room.state.hostId,
      time(now),
      now,
    );
    room.revision++;
    for (const listener of room.listeners) listener();
  }
  if (room.state.completion) {
    const completion = closeCommends(room.state.completion, now);
    if (completion !== room.state.completion) {
      room.state = { ...room.state, completion };
      recordCompletedMatch(completion, room.room);
      room.revision++;
      for (const listener of room.listeners) listener();
    }
  }
}
export function readReadyRoom(
  id: string,
  token: string,
  now: number,
): ReadySnapshot {
  const { room, actor } = lookup(id, token, now);
  expire(room, now);
  const state = structuredClone(room.state);
  if (
    state.dotaLobby &&
    ![...state.radiant, ...state.dire].some((player) => player.id === actor)
  )
    state.dotaLobby = { ...state.dotaLobby, password: undefined };
  return {
    state,
    room: {
      ...room.room,
      players: allPlayers(state).length,
      status: roomStatusForPhase(state.phase),
    },
    sessionId: id,
    revision: room.revision,
    serverNow: now,
    session:
      actor === state.hostId
        ? { id, roomId: state.roomId, tokens: { ...room.tokens } }
        : undefined,
  };
}
export function subscribeReadyRoom(
  id: string,
  token: string,
  listener: () => void,
  now: number,
) {
  const { room } = lookup(id, token, now);
  room.listeners.add(listener);
  return () => room.listeners.delete(listener);
}
export function commandReadyRoom(
  id: string,
  token: string,
  command: ReadyCommand,
  now: number,
): ReadySnapshot {
  const { room, actor } = lookup(id, token, now);
  expire(room, now);
  if (command.type === "privacy") {
    if (
      actor !== room.state.hostId ||
      ["IN_GAME", "FINISHED"].includes(room.state.phase)
    )
      throw new Error(
        "Solo el creador puede configurar la privacidad antes del inicio.",
      );
    if (typeof command.isPrivate !== "boolean")
      throw new Error("Privacidad no válida.");
    const credential = command.isPrivate
      ? command.password
        ? hashRoomPassword(command.password)
        : room.credential
      : undefined;
    if (command.isPrivate && !credential)
      throw new Error("Introduce una contraseña para proteger la sala.");
    room.credential = credential;
    room.room.isPrivate = command.isPrivate;
    room.failedJoins = new Map();
  } else if (command.type === "demoCloseCommends") {
    if (
      actor !== room.state.hostId ||
      !room.state.completion ||
      room.state.phase !== "FINISHED"
    )
      throw new Error("Prueba MVP no disponible.");
    room.state = {
      ...room.state,
      completion: closeCommends(
        { ...room.state.completion, voteEndsAt: now },
        now,
      ),
    };
  } else if (
    command.type === "demoAllReady" ||
    command.type === "demoNextReady"
  ) {
    if (actor !== room.state.hostId || room.state.phase !== "READY_CHECK")
      throw new Error("Herramienta demo no disponible.");
    const missing = room.state.readyCheck!.players.filter(
      (player) => !room.state.readyCheck!.readyPlayerIds.includes(player.id),
    );
    for (const player of command.type === "demoNextReady"
      ? missing.slice(0, 1)
      : missing)
      room.state = transitionLobby(
        room.state,
        { type: "confirmReady" },
        player.id,
        time(now),
        now,
      );
  } else if (command.type === "demoLifecycle") {
    if (
      actor !== room.state.hostId ||
      !room.state.attempt ||
      room.state.attempt.id !== command.attemptId
    )
      throw new Error("Herramienta demo no disponible para este intento.");
    if (!["lobbySent", "gameStarted", "gameFinished"].includes(command.event))
      throw new Error("Evento demo inválido.");
    const update =
      command.event === "lobbySent"
        ? {
            lobbySent: true,
            lobbyId: `demo-${room.state.attempt.id}`,
            name: `Demo · ${room.room.title}`,
            region: room.room.region,
            mode: room.room.mode,
          }
        : command.event === "gameStarted"
          ? {
              gameStarted: true,
              connectedPlayerIds: [
                ...room.state.radiant,
                ...room.state.dire,
              ].map((player) => player.id),
            }
          : { gameFinished: true, winningTeam: command.winningTeam };
    room.state = applyDotaBotUpdate(
      room.state,
      { ...update, attemptId: command.attemptId },
      time(now),
      now,
    );
  } else if (command.type === "demoRoom") {
    const next = applyDemoRoomAction(
      room.state,
      command.action,
      actor,
      time(now),
    );
    if (!isActiveRoomPhase(room.state.phase) && isActiveRoomPhase(next.phase)) {
      const owned = findActiveOwnedRoom(room.state.hostId, now);
      if (owned && owned.id !== room.room.id)
        throw new ActiveRoomConflict(owned);
    }
    room.state = next;
    for (const player of allPlayers(room.state))
      room.tokens[player.id] ??= randomUUID();
  } else {
    // The public demo endpoint never accepts bot information, a roster replacement,
    // a caller-supplied actor or caller-supplied time.
    if (["expireReadyCheck", "finish", "join"].includes(command.type))
      throw new Error(
        "El reloj, la entrada y el resultado pertenecen al servidor.",
      );
    room.state = transitionLobby(
      room.state,
      command as Action,
      actor,
      time(now),
      now,
    );
  }
  if (room.state.completion)
    recordCompletedMatch(room.state.completion, room.room);
  if (room.state.cancelVote?.status === "PASSED" && room.state.attempt)
    voidMatchPredictions(room.state.attempt.id, now);
  if (command.type === "kick") delete room.tokens[command.playerId];
  room.revision++;
  for (const listener of room.listeners) listener();
  if (command.type === "leave") {
    const state = structuredClone(room.state);
    if (state.dotaLobby) state.dotaLobby.password = undefined;
    return {
      state,
      room: {
        ...room.room,
        status: roomStatusForPhase(room.state.phase),
        players: allPlayers(room.state).length,
      },
      sessionId: id,
      revision: room.revision,
      serverNow: now,
    };
  }
  return readReadyRoom(id, token, now);
}

export function createRoomSession(
  state: LobbyState,
  room: Room,
  actorId: string,
  now: number,
  password?: string,
) {
  if (
    !room.title?.trim() ||
    room.title.length > 60 ||
    !normalizeRoomMode(room.mode) ||
    !normalizeRoomServer(room.region)
  )
    throw new Error("Configuración de sala no válida.");
  const credential = room.isPrivate
    ? hashRoomPassword(password ?? "")
    : undefined;
  const session = createReadySession(
    state,
    { ...room, hostId: actorId, isPrivate: !!credential },
    actorId,
    now,
    undefined,
    true,
  );
  rooms.get(session.id)!.credential = credential;
  return session;
}
export function joinRoomSession(
  roomId: string,
  player: Player,
  password: string | undefined,
  now: number,
) {
  const id = roomIds.get(roomId),
    stored = id ? rooms.get(id) : undefined;
  if (!id || !stored || stored.expiresAt <= now)
    throw new Error("Sala no disponible.");
  const member = allPlayers(stored.state).some(
    (value) => value.id === player.id,
  );
  if (!member && stored.credential && player.id !== stored.state.hostId) {
    stored.failedJoins ??= new Map();
    const failed = stored.failedJoins.get(player.id);
    if (failed && failed.count >= 5 && failed.until > now)
      throw new Error("Espera unos segundos antes de volver a intentar.");
    if (!verifyRoomPassword(password ?? "", stored.credential)) {
      stored.failedJoins.set(player.id, {
        count: failed && failed.until > now ? failed.count + 1 : 1,
        until: now + 30_000,
      });
      throw new Error("Contraseña incorrecta.");
    }
    stored.failedJoins.delete(player.id);
  }
  if (!member) {
    if (allPlayers(stored.state).length >= roomConfig.maxParticipants)
      throw new Error("La sala ha alcanzado su límite de participantes.");
    const current = readParticipant(player.id);
    const identity = current
      ? { ...player, elo: current.elo, xp: current.xp, level: current.level }
      : player;
    stored.state = transitionLobby(
      stored.state,
      { type: "join", player: identity },
      identity.id,
      time(now),
      now,
    );
    stored.tokens[identity.id] = randomUUID();
    stored.revision++;
    registerParticipants([identity]);
    for (const listener of stored.listeners) listener();
  }
  return {
    session: {
      id,
      roomId,
      tokens:
        player.id === stored.state.hostId
          ? { ...stored.tokens }
          : { [player.id]: stored.tokens[player.id] },
    },
    snapshot: readReadyRoom(id, stored.tokens[player.id], now),
  };
}
export function publicRoomList(now: number) {
  return [...rooms.values()]
    .filter((room) => room.expiresAt > now)
    .map((room) => ({
      ...room.room,
      hostId: room.state.hostId,
      players: allPlayers(room.state).length,
      status: roomStatusForPhase(room.state.phase),
    }));
}
export function predictionWindows(now: number, playerId: string) {
  return [...rooms.values()]
    .filter(
      (room) =>
        room.expiresAt > now &&
        room.state.phase === "IN_GAME" &&
        room.state.matchStartedAt !== undefined &&
        (!room.room.isPrivate ||
          allPlayers(room.state).some((player) => player.id === playerId)),
    )
    .map((room) => ({
      id: room.state.attempt!.id,
      roomId: room.room.id,
      name: room.room.title,
      radiant: room.state.radiant,
      dire: room.state.dire,
      captains: room.state.captains,
      startedAt: room.state.matchStartedAt!,
      closesAt: room.state.matchStartedAt! + pointsConfig.predictionDurationMs,
    }));
}
export function predictionTarget(
  matchId: string,
  playerId: string,
  now: number,
) {
  const room = [...rooms.values()].find(
    (room) => room.expiresAt > now && room.state.attempt?.id === matchId,
  );
  if (
    !room ||
    room.state.matchStartedAt === undefined ||
    (room.room.isPrivate &&
      !allPlayers(room.state).some((player) => player.id === playerId))
  )
    throw new Error("Partida no disponible para predicciones.");
  return {
    id: matchId,
    name: room.room.title,
    startedAt: room.state.matchStartedAt,
    radiant: room.state.radiant,
    dire: room.state.dire,
    participantIds: [...room.state.radiant, ...room.state.dire].map(
      (player) => player.id,
    ),
    finished: room.state.phase !== "IN_GAME",
  };
}

// Explicit observer-demo controls, never exposed as normal player commands.
export function controlDemoMatch(
  id: string,
  token: string,
  action: "advance" | "cancel",
  seconds: number,
  now: number,
) {
  const { room, actor } = lookup(id, token, now);
  if (
    actor !== room.state.hostId ||
    !room.state.attempt ||
    room.state.phase !== "IN_GAME"
  )
    throw new Error("Demo de partida no disponible.");
  if (action === "advance") {
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 3600)
      throw new Error("Avance de reloj no válido.");
    room.state = {
      ...room.state,
      matchStartedAt: room.state.matchStartedAt! - seconds * 1000,
    };
  } else {
    voidMatchPredictions(room.state.attempt.id, now);
    room.state = {
      ...room.state,
      phase: "READY",
      matchStartedAt: undefined,
      dotaLobby: undefined,
      readyCheck: undefined,
      cancelVote: {
        attemptId: room.state.attempt.id,
        status: "PASSED",
        voterIds: [...room.state.radiant, ...room.state.dire]
          .slice(0, 8)
          .map((player) => player.id),
      },
    };
    room.state.messages = [
      ...room.state.messages,
      {
        id: room.state.messages.length,
        kind: "system",
        time: time(now),
        text: "Partida cancelada mediante la herramienta demo (8/10 simulados). Se conservan equipos, capitanes y picks; las predicciones se reembolsan.",
      },
    ];
  }
  room.revision++;
  for (const listener of room.listeners) listener();
}

// Integration seam for the trusted Dota bot. It is deliberately absent from
// the player/demo HTTP action API, so players cannot claim Dota connectivity.
export function updateReadyRoomFromBot(
  id: string,
  update: Parameters<typeof applyDotaBotUpdate>[1],
  now: number,
) {
  const room = rooms.get(id);
  if (!room || room.expiresAt <= now) throw new Error("Sala no disponible.");
  room.state = applyDotaBotUpdate(room.state, update, time(now), now);
  if (room.state.completion)
    recordCompletedMatch(room.state.completion, room.room);
  room.revision++;
  for (const listener of room.listeners) listener();
}
