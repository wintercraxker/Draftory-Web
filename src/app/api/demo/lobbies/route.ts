import {
  findActiveOwnedRoom,
  publicRoomList,
  predictionWindows,
  predictionTarget,
} from "@/lib/rooms/ready-server";
import {
  authenticateAccount,
  placePrediction,
  readAccount,
  getPredictionQuote,
} from "@/lib/progression/server";
import { randomUUID } from "node:crypto";
import { createLobby } from "@/lib/rooms/engine";
import { applyDemoRoomAction } from "@/lib/rooms/demo";
import {
  createReadySession,
  commandReadyRoom,
  updateReadyRoomFromBot,
  readReadyRoom,
  controlDemoMatch,
} from "@/lib/rooms/ready-server";
import { createCompetitiveStats } from "@/lib/competitive";
import type { Room } from "@/lib/room-mock-data";
const demoShared = globalThis as typeof globalThis & {
  draftoryPredictionDemos?: Map<
    string,
    { sessionId: string; token: string; ownerId: string }
  >;
};
const demos = (demoShared.draftoryPredictionDemos ??= new Map());
export const runtime = "nodejs";
export async function GET(request: Request) {
  const now = Date.now();
  try {
    const player = authenticateAccount(
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
    );
    const windows = predictionWindows(now, player.id).map((window) => ({
      ...window,
      quote: getPredictionQuote(predictionTarget(window.id, player.id, now)),
      demo: demos.get(window.id)?.ownerId === player.id,
    }));
    return Response.json(
      {
        rooms: publicRoomList(now),
        ownedRoom: findActiveOwnedRoom(player.id, now),
        windows,
        serverNow: now,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { rooms: publicRoomList(now), windows: [], serverNow: now },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: Request) {
  try {
    const player = authenticateAccount(
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "",
    );
    const body = await request.json(),
      now = Date.now();
    if (body.type === "demoLive") {
      const hostId = `observer-demo-host-${randomUUID()}`;
      const room: Room = {
        id: `prediction-demo-${randomUUID()}`,
        title: "Aurora vs Nova · demo",
        host: "Aurora",
        hostId,
        mode: "Captain's Mode",
        region: "Sudamérica",
        status: "waiting",
        players: 19,
        formation: "captains",
      };
      const state = applyDemoRoomAction(
        createLobby(
          hostId,
          [{ id: hostId, name: "Aurora", ...createCompetitiveStats(4500) }],
          "captains",
          room.id,
        ),
        "fill5v5",
        hostId,
        "Demo",
      );
      const session = createReadySession(state, room, hostId, now),
        token = session.tokens[hostId];
      const ready = commandReadyRoom(
        session.id,
        token,
        { type: "demoAllReady" },
        now,
      );
      const attemptId = ready.state.attempt!.id;
      updateReadyRoomFromBot(
        session.id,
        {
          attemptId,
          lobbySent: true,
          gameStarted: true,
          connectedPlayerIds: [...state.radiant, ...state.dire].map(
            (player) => player.id,
          ),
        },
        now,
      );
      demos.set(attemptId, {
        sessionId: session.id,
        token,
        ownerId: player.id,
      });
      return Response.json({
        room: readReadyRoom(session.id, token, now).room,
      });
    }
    if (body.type === "demoResolve") {
      const demo = demos.get(body.matchId);
      if (
        !demo ||
        demo.ownerId !== player.id ||
        !["radiant", "dire"].includes(body.winningTeam)
      )
        throw new Error("Herramienta demo no disponible.");
      updateReadyRoomFromBot(
        demo.sessionId,
        {
          attemptId: body.matchId,
          gameFinished: true,
          winningTeam: body.winningTeam,
        },
        now,
      );
      return Response.json({ account: readAccount(player.id) });
    }
    if (["demoAdvance", "demoCancel"].includes(body.type)) {
      const demo = demos.get(body.matchId);
      if (!demo || demo.ownerId !== player.id)
        throw new Error("Herramienta demo no disponible.");
      controlDemoMatch(
        demo.sessionId,
        demo.token,
        body.type === "demoAdvance" ? "advance" : "cancel",
        body.seconds,
        now,
      );
      return Response.json({ account: readAccount(player.id) });
    }
    const prediction = placePrediction(
      player.id,
      predictionTarget(body.matchId, player.id, now),
      body.team,
      body.amount,
      now,
      body.odds,
    );
    return Response.json({ prediction, account: readAccount(player.id) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Predicción no disponible.",
      },
      { status: 400 },
    );
  }
}
