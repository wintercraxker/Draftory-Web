import {
  reserveRequestBudget,
  acquireStreamLease,
  RequestLimitError,
} from "@/lib/real/request-budget";
import { cookies } from "next/headers";
import { authConfig } from "@/lib/auth/config";
import { sessionUser } from "@/lib/auth/repository";
import { prisma } from "@/lib/prisma";
import { listRealRooms, readRoomRevisions } from "@/lib/real/room-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Finite stream: reconnecting browsers receive a fresh persisted snapshot.
export const maxDuration = 60;
export async function GET(request: Request) {
  const token = (await cookies()).get(authConfig.sessionCookie)?.value;
  const user = await sessionUser(prisma, token);
  if (!user?.profile?.onboardingCompletedAt)
    return new Response(null, { status: 401 });
  let lease: Awaited<ReturnType<typeof acquireStreamLease>>;
  try {
    await reserveRequestBudget("room-stream", user.id, 20, 60000);
    lease = await acquireStreamLease(user.id);
  } catch (error) {
    return Response.json(
      { error: "No se pudo abrir la conexión. Inténtalo de nuevo." },
      {
        status: error instanceof RequestLimitError ? 429 : 503,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof RequestLimitError
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false,
    busy = false,
    previous = "";
  let detach = () => {};
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(lifetime);
        detach();
        void lease.release().catch(() => {});
        controller.close();
      };
      const tick = async () => {
        if (closed || busy) return;
        if ((controller.desiredSize ?? 1) <= 0) {
          close();
          return;
        }
        busy = true;
        try {
          if (!(await lease.refresh()) || !(await sessionUser(prisma, token))) {
            close();
            return;
          }
          const fingerprint = JSON.stringify(await readRoomRevisions(user.id));
          const payload =
            fingerprint !== previous
              ? JSON.stringify(await listRealRooms(user.id))
              : null;
          if (!closed) {
            if (payload !== null) {
              controller.enqueue(
                encoder.encode(
                  `${previous === "" ? "retry: 3000\n" : ""}data: ${payload}\n\n`,
                ),
              );
              previous = fingerprint;
            } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        } catch {
          if (!closed)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        } finally {
          busy = false;
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      detach = () => request.signal.removeEventListener("abort", close);
      if (request.signal.aborted) {
        close();
        return;
      }
      timer = setInterval(() => {
        void tick();
      }, 3000);
      lifetime = setTimeout(close, 45000);
      void tick();
    },
    cancel() {
      closed = true;
      clearInterval(timer);
      clearTimeout(lifetime);
      detach();
      void lease.release().catch(() => {});
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
