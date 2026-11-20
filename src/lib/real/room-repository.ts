import { roomIdentityInstalled, normalizeRoomPublicId } from "./room-identity";
import { resolveDisplayAvatar } from "../display-avatar";
import { prisma } from "../prisma";
import type { DotaRole, RoomTeam, Prisma } from "../../generated/prisma/client";
import { createRoomOrGetActive } from "../rooms/creation-repository";
import { roomFormat } from "../rooms/lobby-options.mjs";
import { roomConfig } from "../rooms/config";
import { terminalRoomPhases } from "../rooms/ownership";
import { gameplayConfirmed } from "../dota-start-evidence";
import { assertSingleRoom } from "../rooms/participation-repository";
import {
  verifyRoomPasswordAsync,
  hashRoomPasswordAsync,
  type RoomCredential,
} from "../rooms/privacy";
import {
  normalizeRoomMode,
  normalizeRoomServer,
} from "../rooms/lobby-options.mjs";
import { getXpProgress } from "../competitive";
import { validateRole, type DotaRoleId } from "../dota-roles";
import { AccountError, objectInput, plainText } from "./http";
import { assertParticipation } from "./suspension";
import { productLog } from "./observability";
import type { RealRoom } from "./types";
import {
  competitiveAction,
  competitiveCommands,
  competitiveView,
  advanceCompetitiveRoom,
  leaveCompetitiveMember,
} from "./competitive-repository";
import {
  presenceInstalled,
  leaveWithPresence,
  readOnlineMembers,
} from "./room-presence";
import { readPlayerMedals } from "./player-medals";
import { assertCompetitiveMmr, readOperationalMmrs } from "./mmr-repository";

const roster = {
  creator: { select: { displayName: true } },
  members: {
    where: { leftAt: null },
    include: {
      user: {
        select: {
          displayName: true,
          avatar: true,
          customAvatarUrl: true,
          profile: { select: { elo: true, xp: true } },
          dotaAccount: { select: { mmr: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" as const },
  },
} as const;
type RoomRow = Prisma.RoomGetPayload<{ include: typeof roster }>;
const editablePhases = [
  "WAITING",
  "CHOOSING_CAPTAINS",
  "DECIDING_FIRST_PICK",
  "DRAFTING",
  "READY",
];
function dto(room: RoomRow, userId: string, detail = false): RealRoom {
  return {
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    creatorName: room.creator.displayName || "Jugador de Steam",
    mode: room.mode,
    region: room.region,
    phase: room.phase,
    formation: room.formation,
    firstPickMethod: room.firstPickMethod,
    isPrivate: room.isPrivate,
    revision: room.revision,
    participants: room.members.length,
    assigned: room.members.filter((member) => member.team !== "BENCH").length,
    capacity: roomFormat(room.mode).players,
    joined: room.members.some((member) => member.userId === userId),
    ...(detail
      ? {
          members: room.members.map((member) => ({
            userId: member.userId,
            name: member.user.displayName || "Jugador de Steam",
            avatar: resolveDisplayAvatar(member.user),
            team: member.team,
            roomRole: (member.roomRole?.toLowerCase() as DotaRoleId) ?? null,
            isCaptain: member.isCaptain,
            elo: member.user.profile?.elo ?? null,
            level: member.user.profile
              ? getXpProgress(member.user.profile.xp).level
              : null,
            mmr: member.user.dotaAccount?.mmr ?? null,
          })),
        }
      : {}),
  };
}
export async function listRealRooms(userId: string, db = prisma) {
  const where = {
    phase: { notIn: [...terminalRoomPhases] },
    OR: [
      { isPrivate: false },
      { creatorId: userId },
      { members: { some: { userId, leftAt: null } } },
    ],
  };
  const timers = await db.room.findMany({
    where: {
      ...where,
      phase: { in: ["READY_CHECK", "DECIDING_FIRST_PICK", "DRAFTING"] },
    },
    select: { id: true },
    take: 100,
  });
  for (const room of timers) await advanceCompetitiveRoom(room.id, db);
  const rooms = await db.room.findMany({
    where,
    include: {
      matches: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { dotaMatchId: true, launchControl: true },
      },
      creator: { select: { displayName: true } },
      members: {
        where: { leftAt: null },
        select: { userId: true, team: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const identities = (await roomIdentityInstalled(db))
    ? await db.roomIdentity.findMany({
        where: { roomId: { in: rooms.map((r) => r.id) } },
      })
    : [];
  const publicIds = new Map(identities.map((i) => [i.roomId, i.publicId]));
  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    creatorName: room.creator.displayName || "Jugador de Steam",
    mode: room.mode,
    region: room.region,
    phase: room.phase,
    liveConfirmed: gameplayConfirmed(
      room.matches[0]?.launchControl,
      room.matches[0]?.dotaMatchId ?? null,
      Date.now(),
    ),
    formation: room.formation,
    firstPickMethod: room.firstPickMethod,
    isPrivate: room.isPrivate,
    revision: room.revision,
    participants: room.members.length,
    assigned: room.members.filter((m) => m.team !== "BENCH").length,
    capacity: roomFormat(room.mode).players,
    joined: room.members.some((m) => m.userId === userId),
    publicId: publicIds.get(room.id) ?? null,
  }));
}
export async function readRoomRevisions(userId: string, db = prisma) {
  const where = {
    phase: { notIn: [...terminalRoomPhases] },
    OR: [
      { isPrivate: false },
      { creatorId: userId },
      { members: { some: { userId, leftAt: null } } },
    ],
  };
  // Keep draft/RPS deadlines authoritative even when only the room list is open.
  const timers = await db.room.findMany({
    where: { ...where, phase: { in: ["DECIDING_FIRST_PICK", "DRAFTING"] } },
    select: { id: true },
    take: 100,
  });
  for (const room of timers) await advanceCompetitiveRoom(room.id, db);
  return db.room.findMany({
    where,
    select: {
      id: true,
      revision: true,
      creator: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export async function readRealRoom(
  userId: string,
  roomId: string,
  db = prisma,
) {
  const room = await db.room.findUnique({
    where: { id: roomId },
    include: roster,
  });
  if (
    !room ||
    (room.isPrivate &&
      room.creatorId !== userId &&
      !room.members.some((member) => member.userId === userId))
  )
    throw new AccountError("Sala no disponible.", 404);
  await advanceCompetitiveRoom(roomId, db);
  return db.$transaction(
    async (tx) => {
      const current = await tx.room.findUniqueOrThrow({
        where: { id: roomId },
        include: roster,
      });
      if (
        current.isPrivate &&
        current.creatorId !== userId &&
        !current.members.some((m) => m.userId === userId)
      )
        throw new AccountError("Sala no disponible.", 404);
      const identity = (await roomIdentityInstalled(tx))
        ? await tx.roomIdentity.findUnique({ where: { roomId } })
        : null;
      const result = dto(current, userId, true),
        online = await readOnlineMembers(roomId, tx);
      const medals = await readPlayerMedals(
        tx,
        current.members.map((m) => m.userId),
        userId,
      );
      result.members = result.members?.map((m) => ({
        ...m,
        ...medals.get(m.userId),
      }));
      const mmrs = await readOperationalMmrs(
        current.members.map((m) => m.userId),
        tx,
      );
      result.members = result.members?.map((m) =>
        mmrs.has(m.userId)
          ? {
              ...m,
              mmr: mmrs.get(m.userId)!.value,
              mmrVerified: mmrs.get(m.userId)!.verified,
            }
          : m,
      );
      if (online)
        result.members = result.members?.map((m) => ({
          ...m,
          online: online.has(m.userId),
        }));
      const competitive = await competitiveView(roomId, tx, db);
      if (
        ["READY_CHECK", "PREPARING", "WAITING_FOR_PLAYERS", "IN_GAME"].includes(
          current.phase,
        )
      ) {
        const frozen = await tx.$queryRaw<
          { userId: string; mmrSnapshot: number | null }[]
        >`SELECT p."userId",p."mmrSnapshot" FROM "MatchPlayer" p JOIN "Match" m ON m.id=p."matchId" WHERE m.id=(SELECT id FROM "Match" WHERE "roomId"=${roomId} ORDER BY "attemptNumber" DESC LIMIT 1) AND m.status IN ('QUEUED','LOBBY_SENT','IN_PROGRESS')`;
        const values = new Map(frozen.map((p) => [p.userId, p.mmrSnapshot]));
        result.members = result.members?.map((m) =>
          values.has(m.userId)
            ? {
                ...m,
                mmr: values.get(m.userId)!,
                mmrVerified: undefined,
                mmrFrozen: true,
              }
            : m,
        );
      }
      return {
        ...result,
        presenceEnabled: online !== null,
        publicId: identity?.publicId ?? null,
        competitive,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function createRealRoom(
  userId: string,
  input: unknown,
  db = prisma,
) {
  const value = objectInput(input, [
    "name",
    "mode",
    "region",
    "formation",
    "firstPickMethod",
    "isPrivate",
    "password",
  ]);
  const name = plainText(value.name, "Nombre de sala", 60);
  const mode = normalizeRoomMode(value.mode),
    region = normalizeRoomServer(value.region);
  if (
    !mode ||
    !region ||
    !["AUTOMATIC", "CAPTAINS"].includes(String(value.formation)) ||
    !["ROLL", "DICE", "RPS"].includes(String(value.firstPickMethod)) ||
    typeof value.isPrivate !== "boolean"
  )
    throw new AccountError("Configuración de sala inválida.");
  let passwordHash: string | undefined;
  if (value.isPrivate) {
    try {
      passwordHash = JSON.stringify(
        await hashRoomPasswordAsync(value.password),
      );
    } catch {
      throw new AccountError("Usa una contraseña de 4 a 64 caracteres.");
    }
  }
  const result = await createRoomOrGetActive(db, userId, {
    name,
    mode,
    region,
    formation:
      mode === "ONE_V_ONE_MID"
        ? "AUTOMATIC"
        : (value.formation as "AUTOMATIC" | "CAPTAINS"),
    firstPickMethod: value.firstPickMethod as "ROLL" | "DICE" | "RPS",
    isPrivate: value.isPrivate,
    passwordHash,
  });
  return {
    room: await readRealRoom(userId, result.room.id, db),
    existing: result.existing,
  };
}
export async function lookupRoom(input: unknown, db = prisma) {
  const value = objectInput(input, ["publicId"]),
    publicId = normalizeRoomPublicId(value.publicId);
  if (!publicId || !(await roomIdentityInstalled(db)))
    throw new AccountError("Sala no disponible.", 404);
  const identity = await db.roomIdentity.findUnique({
    where: { publicId },
    include: {
      room: { select: { id: true, name: true, isPrivate: true, phase: true } },
    },
  });
  if (
    !identity ||
    terminalRoomPhases.includes(
      identity.room.phase as (typeof terminalRoomPhases)[number],
    )
  )
    throw new AccountError("Sala no disponible.", 404);
  return {
    id: identity.room.id,
    publicId,
    name: identity.room.name,
    passwordRequired: identity.room.isPrivate,
  };
}
async function reserveRoomEntry(userId: string, db: typeof prisma) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
    await tx.$executeRaw`INSERT INTO "RoomAccessBudget" ("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT "userId" FROM "RoomAccessBudget" WHERE "userId"=${userId} FOR UPDATE`;
    const now = (
        await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`
      )[0].now,
      old = await tx.roomAccessBudget.findUniqueOrThrow({ where: { userId } });
    const fresh = now.getTime() - old.windowStart.getTime() >= 60000;
    if (!fresh && old.attempts >= 12)
      throw new AccountError(
        "Espera un momento antes de volver a entrar.",
        429,
      );
    await tx.roomAccessBudget.update({
      where: { userId },
      data: {
        attempts: fresh ? 1 : old.attempts + 1,
        ...(fresh ? { windowStart: now } : {}),
      },
    });
  });
}
export async function joinRoomByPublicId(
  userId: string,
  input: unknown,
  db = prisma,
) {
  const value = objectInput(input, ["publicId", "password"]);
  await reserveRoomEntry(userId, db);
  const publicId = normalizeRoomPublicId(value.publicId);
  if (!publicId) throw new AccountError("Introduce un ID de sala válido.");
  const identity = await db.roomIdentity.findUnique({
    where: { publicId },
    select: { roomId: true },
  });
  if (!identity) {
    productLog("room-join", { status: "REJECTED", reason: "UNAVAILABLE" });
    throw new AccountError(
      "No encontramos una sala disponible con esos datos.",
      404,
    );
  }
  // Resolution is internal. Password validation/capacity/enforcement remain under
  // the same Room lock used by every join, never a second client lookup.
  try {
    return await roomAction(
      userId,
      identity.roomId,
      { action: "join", password: value.password },
      db,
      true,
    );
  } catch (error) {
    productLog("room-join", {
      status: "REJECTED",
      reason:
        error instanceof AccountError ? `HTTP_${error.status}` : "UNAVAILABLE",
    });
    throw error;
  }
}
export async function roomAction(
  userId: string,
  roomId: string,
  input: unknown,
  db = prisma,
  entryReserved = false,
) {
  const { blockedPreviewAction } =
    await import("../deployment/preview-policy.mjs");
  if (
    blockedPreviewAction(String((input as { action?: unknown } | null)?.action))
  )
    throw new AccountError(
      "Las partidas están desactivadas durante el ensayo privado.",
      403,
    );
  if (
    input &&
    typeof input === "object" &&
    (input as { action?: unknown }).action === "privacy"
  ) {
    await changeRoomPrivacy(userId, roomId, input, db);
    return readRealRoom(userId, roomId, db);
  }
  if (
    input &&
    typeof input === "object" &&
    competitiveCommands.includes(String((input as { action?: unknown }).action))
  ) {
    await competitiveAction(userId, roomId, input, db);
    return readRealRoom(userId, roomId, db);
  }
  const value = objectInput(input, [
    "action",
    "password",
    "role",
    "targetId",
    "team",
  ]);
  if (
    !["join", "role", "move", "leave", "close"].includes(String(value.action))
  )
    throw new AccountError("Acción inválida.");
  if (value.action === "join" && !entryReserved)
    await reserveRoomEntry(userId, db);
  await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`;
    if (!locked.length) throw new AccountError("Sala no disponible.", 404);
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    const member = await tx.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (value.action === "join") {
      await assertParticipation(tx, [userId]);
      await assertSingleRoom(tx, userId, "join", roomId);
      if (!editablePhases.includes(room.phase))
        throw new AccountError("La sala ya no admite entradas.", 409);
      if (member && !member.leftAt) return;
      await assertCompetitiveMmr(tx, [userId]);
      if (room.isPrivate && room.creatorId !== userId) {
        let valid = false;
        try {
          valid = await verifyRoomPasswordAsync(
            value.password as string,
            JSON.parse(room.passwordHash ?? "null") as RoomCredential,
          );
        } catch {
          /* fail closed */
        }
        if (!valid) throw new AccountError("Contraseña incorrecta.", 403);
      }
      const count = await tx.roomMember.count({
        where: { roomId, leftAt: null },
      });
      if (
        count >=
        (roomFormat(room.mode).players === 2 ? 2 : roomConfig.maxParticipants)
      )
        throw new AccountError("La sala está llena.", 409);
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) throw new AccountError("Completa tu perfil.", 403);
      await tx.roomMember.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, roomRole: profile.preferredRolePrimary },
        update: {
          leftAt: null,
          joinedAt: new Date(),
          team: "BENCH",
          isCaptain: false,
          roomRole: profile.preferredRolePrimary,
        },
      });
    } else {
      if (!member || member.leftAt)
        throw new AccountError("Entra a la sala primero.", 403);
      if (!editablePhases.includes(room.phase))
        throw new AccountError("El encuentro ya está bloqueado.", 409);
      if (value.action === "role") {
        if (value.targetId && value.targetId !== userId)
          throw new AccountError("Solo puedes cambiar tu rol.", 403);
        let role;
        try {
          role = validateRole(value.role);
        } catch {
          throw new AccountError("Rol inválido.");
        }
        await tx.roomMember.update({
          where: { roomId_userId: { roomId, userId } },
          data: { roomRole: role.toUpperCase() as DotaRole },
        });
      } else if (value.action === "move") {
        if (!["WAITING", "READY", "DRAFTING"].includes(room.phase))
          throw new AccountError(
            "No se pueden mover jugadores durante la elección de capitanes o primer pick.",
            409,
          );
        if (room.creatorId !== userId && !member.isCaptain)
          throw new AccountError("Sin permisos para mover jugadores.", 403);
        if (
          typeof value.targetId !== "string" ||
          !["BENCH", "RADIANT", "DIRE"].includes(String(value.team))
        )
          throw new AccountError("Destino inválido.");
        const target = await tx.roomMember.findUnique({
          where: { roomId_userId: { roomId, userId: value.targetId } },
        });
        if (!target || target.leftAt)
          throw new AccountError("Jugador no disponible.", 404);
        if (target.isCaptain && target.team !== value.team)
          throw new AccountError("El capitán conserva su equipo.", 409);
        if (value.team !== "BENCH")
          await assertParticipation(tx, [userId, target.userId]);
        if (room.phase === "DRAFTING" && value.team !== "BENCH")
          throw new AccountError(
            "Selecciona mediante el draft durante esta fase.",
            409,
          );
        if (
          room.creatorId !== userId &&
          ((target.team !== "BENCH" && target.team !== member.team) ||
            (value.team !== "BENCH" && value.team !== member.team))
        )
          throw new AccountError("Solo puedes administrar tu equipo.", 403);
        if (
          value.team !== "BENCH" &&
          target.team !== value.team &&
          (await tx.roomMember.count({
            where: { roomId, team: value.team as RoomTeam, leftAt: null },
          })) >= roomFormat(room.mode).teamSize
        )
          throw new AccountError("Ese equipo ya esta completo.", 409);
        await tx.roomMember.update({
          where: { roomId_userId: { roomId, userId: value.targetId } },
          data: { team: value.team as RoomTeam },
        });
        const radiant = await tx.roomMember.count({
          where: { roomId, leftAt: null, team: "RADIANT" },
        });
        const dire = await tx.roomMember.count({
          where: { roomId, leftAt: null, team: "DIRE" },
        });
        if (["WAITING", "READY"].includes(room.phase)) {
          const draft = await tx.draft.findFirst({
            where: { roomId, status: "COMPLETE" },
            orderBy: { version: "desc" },
          });
          const complete =
            radiant === roomFormat(room.mode).teamSize &&
            dire === roomFormat(room.mode).teamSize &&
            (!roomFormat(room.mode).playerDraft ||
              room.formation === "AUTOMATIC" ||
              !!draft);
          await tx.room.update({
            where: { id: roomId },
            data: { phase: complete ? "READY" : "WAITING" },
          });
        }
      } else if (value.action === "close") {
        if (room.creatorId !== userId)
          throw new AccountError("Solo el creador puede cerrar la sala.", 403);
        await tx.room.update({
          where: { id: roomId },
          data: { phase: "CANCELLED", closedAt: new Date() },
        });
      } else {
        if (await presenceInstalled(tx))
          await leaveWithPresence(tx, roomId, userId);
        else await leaveCompetitiveMember(tx, roomId, userId);
        return;
      }
    }
    await tx.room.update({
      where: { id: roomId },
      data: { revision: { increment: 1 } },
    });
    const updated = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      select: { phase: true },
    });
    await tx.roomEvent.create({
      data: {
        roomId,
        actorId: userId,
        type: String(value.action),
        revision: room.revision + 1,
        payload: {
          phases: { from: room.phase, to: updated.phase },
          ...(value.targetId ? { targetId: String(value.targetId) } : {}),
          ...(value.team ? { team: String(value.team) } : {}),
        },
      },
    });
    const actor = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, username: true },
    });
    const label = actor.displayName ?? actor.username;
    const body =
      value.action === "join"
        ? `${label} entró a la sala.`
        : value.action === "close"
          ? `${label} cerró la sala.`
          : value.action === "role"
            ? `${label} cambió su rol de sala.`
            : `${label} movió un jugador a ${String(value.team)}.`;
    await tx.roomMessage.create({ data: { roomId, kind: "SYSTEM", body } });
  });
  if (value.action === "leave") return { left: true };
  return readRealRoom(userId, roomId, db);
}

export async function changeRoomPrivacy(
  userId: string,
  roomId: string,
  input: unknown,
  db = prisma,
) {
  const value = objectInput(input, [
    "action",
    "isPrivate",
    "password",
    "expectedRevision",
  ]);
  if (
    typeof value.isPrivate !== "boolean" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0
  )
    throw new AccountError(
      "Revisa la privacidad y actualiza la sala antes de continuar.",
    );
  const owner = await db.room.findUnique({
    where: { id: roomId },
    select: { creatorId: true },
  });
  if (!owner) throw new AccountError("Sala no disponible.", 404);
  if (owner.creatorId !== userId)
    throw new AccountError(
      "Solo el propietario puede cambiar la privacidad.",
      403,
    );
  let credential: RoomCredential | null = null;
  if (value.isPrivate) {
    try {
      credential = await hashRoomPasswordAsync(value.password);
    } catch {
      throw new AccountError(
        "Usa una contraseña nueva de 4 a 64 caracteres, sin caracteres de control.",
      );
    }
  } else if (value.password !== undefined)
    throw new AccountError("No envíes una contraseña al quitar la protección.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE`;
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    if (room.creatorId !== userId)
      throw new AccountError(
        "Solo el propietario puede cambiar la privacidad.",
        403,
      );
    if ((terminalRoomPhases as readonly string[]).includes(room.phase))
      throw new AccountError("La sala está cerrada.", 409);
    if (room.revision !== value.expectedRevision)
      throw new AccountError(
        "La sala cambió. Revisa su estado y vuelve a guardar.",
        409,
      );
    await tx.room.update({
      where: { id: roomId },
      data: {
        isPrivate: value.isPrivate as boolean,
        passwordHash: credential ? JSON.stringify(credential) : null,
        revision: { increment: 1 },
      },
    });
    await tx.roomEvent.create({
      data: {
        roomId,
        actorId: userId,
        type: "PRIVACY_CHANGED",
        revision: room.revision + 1,
        payload: {
          from: room.isPrivate,
          to: value.isPrivate as boolean,
          operation: !value.isPrivate
            ? "REMOVED"
            : room.isPrivate
              ? "CHANGED"
              : "ADDED",
        },
      },
    });
  });
}
