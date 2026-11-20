import {
  ActiveRoomConflict,
  createReadySession,
  createRoomSession,
  joinRoomSession,
  commandReadyRoom,
  readReadyRoom,
  subscribeReadyRoom,
} from "@/lib/rooms/ready-server";
import { roomConfig, firstPickMethods } from "@/lib/rooms/config";
import { authenticateAccount } from "@/lib/progression/server";
import { allPlayers, createLobby } from "@/lib/rooms/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let authenticatedId: string | undefined;
  try {
    const text = await request.text();
    if (text.length > 250_000)
      return Response.json(
        { error: "Solicitud demasiado grande." },
        { status: 413 },
      );
    const body = JSON.parse(text);
    const now = Date.now();
    if (body.type === "createRoom" || body.type === "joinRoom") {
      const player = authenticateAccount(body.accountToken);
      authenticatedId = player.id;
      if (body.type === "joinRoom")
        return Response.json(
          joinRoomSession(body.roomId, player, body.password, now),
          { headers: { "Cache-Control": "no-store" } },
        );
      if (
        body.state?.hostId !== player.id ||
        allPlayers(body.state).length !== 1 ||
        allPlayers(body.state)[0].id !== player.id
      )
        throw new Error(
          "El creador debe ser la única cuenta inicial de la sala.",
        );
      if (!["automatic", "captains"].includes(body.room?.formation))
        throw new Error("Modalidad de sala no válida.");
      if (!firstPickMethods.some((method) => method.id === body.state.game))
        throw new Error("Método de primer pick no válido.");
      const state = createLobby(
        player.id,
        [player],
        body.room.formation,
        body.room.id,
      );
      state.game = body.state.game;
      const session = createRoomSession(
        state,
        { ...body.room, host: player.name },
        player.id,
        now,
        body.password,
      );
      return Response.json(
        {
          session,
          snapshot: readReadyRoom(session.id, session.tokens[player.id], now),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.type === "create") {
      const session = createReadySession(
        body.state,
        body.room,
        body.actorId,
        now,
        body.ownerToken,
      );
      return Response.json(
        {
          session,
          snapshot: readReadyRoom(
            session.id,
            session.tokens[body.actorId],
            now,
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      commandReadyRoom(body.id, body.token, body.action, now),
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
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la sala.",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "",
    token = params.get("token") ?? "";
  try {
    readReadyRoom(id, token, Date.now());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sala no disponible." },
      { status: 403 },
    );
  }
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify(readReadyRoom(id, token, Date.now()))}\n\n`,
            ),
          );
        } catch {
          cleanup();
          try {
            controller.close();
          } catch {}
        }
      };
      const unsubscribe = subscribeReadyRoom(id, token, send, Date.now());
      const timer = setInterval(send, roomConfig.readyCheckHeartbeatMs);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      send();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
