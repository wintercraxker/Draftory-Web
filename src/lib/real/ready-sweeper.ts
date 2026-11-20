import { prisma } from "../prisma";
import { advanceCompetitiveRoom } from "./competitive-repository";

const projectionCursors = new WeakMap<object, string>();

// Server timer; Room lock + persisted deadline remain the authority across processes.
export async function sweepExpiredReadyChecks(db = prisma) {
  const checks = await db.readyCheck.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
      room: { phase: "READY_CHECK" },
    },
    select: { roomId: true },
    orderBy: { expiresAt: "asc" },
    take: 100,
  });
  const advanceSafely = async (id: string) => {
    try {
      await advanceCompetitiveRoom(id, db);
    } catch {
      console.warn("DRAFTORY_ROOM_PROJECTION_REQUIRES_REVIEW");
    }
  };
  for (const { roomId } of checks) await advanceSafely(roomId);
  const durableCursor =
    process.env.VERCEL === "1" ||
    process.env.DRAFTORY_BACKGROUND_MODE === "external";
  const cursor = durableCursor
    ? (
        await db.$queryRaw<
          { subject: string }[]
        >`SELECT subject FROM "RequestLease" WHERE id='ready-projection-cursor'`
      )[0]?.subject
    : projectionCursors.get(db);
  let active = await db.room.findMany({
    where: {
      phase: {
        in: [
          "PREPARING",
          "WAITING_FOR_PLAYERS",
          "IN_GAME",
          "FINISHED",
          "READY",
        ],
      },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 100,
  });
  if (!active.length && cursor)
    active = await db.room.findMany({
      where: {
        phase: {
          in: [
            "PREPARING",
            "WAITING_FOR_PLAYERS",
            "IN_GAME",
            "FINISHED",
            "READY",
          ],
        },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
    });
  if (active.length) {
    const last = active.at(-1)!.id;
    if (durableCursor)
      await db.$executeRaw`INSERT INTO "RequestLease"(id,subject,"expiresAt") VALUES('ready-projection-cursor',${last},clock_timestamp()+interval '30 days') ON CONFLICT(id) DO UPDATE SET subject=EXCLUDED.subject,"expiresAt"=EXCLUDED."expiresAt"`;
    else projectionCursors.set(db, last);
  }
  for (const { id } of active) await advanceSafely(id);
  return checks.length;
}

const globalTimers = globalThis as typeof globalThis & {
  draftoryReadySweeper?: ReturnType<typeof setInterval>;
};
export function startReadySweeper() {
  if (globalTimers.draftoryReadySweeper) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await sweepExpiredReadyChecks();
    } catch {
      console.warn("DRAFTORY_READY_SWEEP_UNAVAILABLE");
    } finally {
      busy = false;
    }
  };
  globalTimers.draftoryReadySweeper = setInterval(() => {
    void tick();
  }, 3000);
  globalTimers.draftoryReadySweeper.unref();
  void tick();
}
