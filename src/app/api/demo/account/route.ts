import { randomUUID } from "node:crypto";
import {
  authenticateAccount,
  createAccountSession,
  readAccount,
  configureProfile,
  configureAvatar,
} from "@/lib/progression/server";
import {
  readMatchLedger,
  readParticipant,
  registerParticipants,
} from "@/lib/rooms/match-ledger";
import { createLobby } from "@/lib/rooms/engine";
import { applyDemoRoomAction } from "@/lib/rooms/demo";
import {
  ActiveRoomConflict,
  createReadySession,
  commandReadyRoom,
  updateReadyRoomFromBot,
  readReadyRoom,
} from "@/lib/rooms/ready-server";
import type { Room } from "@/lib/room-mock-data";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const player = authenticateAccount(
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
    );
    readMatchLedger(Date.now());
    return Response.json(readAccount(player.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Sesión no válida." }, { status: 401 });
  }
}
export async function POST(request: Request) {
  let authenticatedId: string | undefined;
  try {
    const body = await request.json();
    const now = Date.now();
    if (body.type === "avatar") {
      const identity = authenticateAccount(body.token),
        profile = configureAvatar(identity.id, body.avatar);
      registerParticipants([profile]);
      return Response.json({
        player: { ...profile, ...readParticipant(identity.id) },
      });
    }
    if (body.type === "profile") {
      const identity = authenticateAccount(body.token);
      const profile = configureProfile(identity.id, body.profile);
      registerParticipants([profile]);
      return Response.json({
        player: { ...profile, ...readParticipant(identity.id) },
      });
    }
    if (body.type === "demoMvp") {
      const identity = authenticateAccount(body.token);
      authenticatedId = identity.id;
      const player = readParticipant(identity.id) ?? identity;
      const room: Room = {
        id: `mvp-demo-${randomUUID()}`,
        title: "Prueba MVP · demo",
        mode: "All Pick",
        region: "Sudamérica",
        host: player.name,
        hostId: player.id,
        status: "waiting",
        players: 19,
        formation: "captains",
      };
      const state = applyDemoRoomAction(
        createLobby(player.id, [player], "captains", room.id),
        "fill5v5",
        player.id,
        "Demo",
      );
      const session = createReadySession(state, room, player.id, now);
      const ready = commandReadyRoom(
        session.id,
        session.tokens[player.id],
        { type: "demoAllReady" },
        now,
      );
      const ids = [...state.radiant, ...state.dire].map((p) => p.id);
      updateReadyRoomFromBot(
        session.id,
        {
          attemptId: ready.state.attempt!.id,
          lobbySent: true,
          gameStarted: true,
          connectedPlayerIds: ids,
        },
        now,
      );
      updateReadyRoomFromBot(
        session.id,
        {
          attemptId: ready.state.attempt!.id,
          gameFinished: true,
          winningTeam: body.won === false ? "dire" : "radiant",
          durationSeconds: 2538,
        },
        now,
      );
      return Response.json({
        session,
        snapshot: readReadyRoom(session.id, session.tokens[player.id], now),
        account: readAccount(player.id),
      });
    }
    const session = createAccountSession(body.token);
    readMatchLedger(now);
    const competitive = readParticipant(session.player.id);
    return Response.json(
      {
        ...session,
        player: {
          ...session.player,
          elo: competitive?.elo ?? session.player.elo,
          xp: competitive?.xp ?? session.player.xp,
          level: competitive?.level ?? session.player.level,
        },
        account: readAccount(session.player.id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ActiveRoomConflict)
      return Response.json(
        {
          error: error.message,
          code: error.code,
          ...(authenticatedId === error.room.hostId
            ? { room: error.room }
            : {}),
        },
        { status: 409 },
      );
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Acción no disponible.",
      },
      { status: 400 },
    );
  }
}
