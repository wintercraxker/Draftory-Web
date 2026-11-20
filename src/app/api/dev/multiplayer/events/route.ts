import { devGate } from "@/lib/dev/http";
import { multiplayerDb } from "@/lib/dev/multiplayer";
import { listRealRooms } from "@/lib/real/room-repository";
import { AccountError } from "@/lib/real/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export {
  devUnsupported as POST,
  devUnsupported as PUT,
  devUnsupported as PATCH,
  devUnsupported as DELETE,
  devUnsupported as OPTIONS,
  devUnsupported as HEAD,
} from "@/lib/dev/http";
export async function GET(request: Request) {
  try {
    devGate(request);
    await multiplayerDb();
  } catch (error) {
    return new Response(null, {
      status: error instanceof AccountError ? error.status : 503,
    });
  }
  let closed = false,
    busy = false,
    previous = "";
  let timer: ReturnType<typeof setInterval>;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (!closed) {
          closed = true;
          clearInterval(timer);
          controller.close();
        }
      };
      const tick = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          devGate(request);
          const db = await multiplayerDb();
          const payload = JSON.stringify(
            await listRealRooms("mp-player-1", db),
          );
          if (!closed) {
            controller.enqueue(
              encoder.encode(
                payload !== previous
                  ? `data: ${payload}\n\n`
                  : ": heartbeat\n\n",
              ),
            );
            previous = payload;
          }
        } catch {
          close();
        } finally {
          busy = false;
        }
      };
      timer = setInterval(() => void tick(), 3000);
      request.signal.addEventListener("abort", close, { once: true });
      void tick();
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
