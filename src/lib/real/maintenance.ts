import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sweepExpiredReadyChecks } from "@/lib/real/ready-sweeper";
import { reconcileRoomPresence } from "@/lib/real/room-presence";
import { sweepMatchResults } from "@/lib/real/result-sweeper";
import { authorizationExecutor } from "@/lib/real/attempt-authorization";
import { expireUnsentQueue } from "../../../apps/dota-worker/shared-health.mjs";

// Shared by authenticated cron/manual requests and post-response catch-up.
// SQL leases preserve exclusivity across Vercel instances and process restarts.
export async function runMaintenanceTick(
  { cooldown = false } = {},
  db = prisma,
) {
  if (process.env.VERCEL_ENV === "preview")
    throw Error("PREVIEW_MAINTENANCE_FORBIDDEN");
  const owner = randomUUID();
  try {
    const acquired = await db.$queryRaw<
      { id: string }[]
    >`INSERT INTO "RequestLease"(id,subject,"expiresAt") VALUES('background-maintenance',${owner},clock_timestamp()+interval '90 seconds') ON CONFLICT(id) DO UPDATE SET subject=EXCLUDED.subject,"expiresAt"=EXCLUDED."expiresAt" WHERE "RequestLease"."expiresAt"<=clock_timestamp() RETURNING id`;
    if (!acquired.length) return { busy: true };
    if (cooldown) {
      const ready = await db.$queryRaw<
        { id: string }[]
      >`INSERT INTO "RequestLease"(id,subject,"expiresAt") VALUES('background-maintenance-cooldown','web-catchup',clock_timestamp()+interval '15 seconds') ON CONFLICT(id) DO UPDATE SET "expiresAt"=EXCLUDED."expiresAt" WHERE "RequestLease"."expiresAt"<=clock_timestamp() RETURNING id`;
      if (!ready.length) return { busy: true };
    }
    await expireUnsentQueue(authorizationExecutor(db));
    await sweepExpiredReadyChecks(db);
    await reconcileRoomPresence(db);
    if (process.env.DRAFTORY_ENABLE_DOTA_RESULTS === "true")
      await sweepMatchResults(db);
    return { ok: true };
  } finally {
    await db.$executeRaw`DELETE FROM "RequestLease" WHERE id='background-maintenance' AND subject=${owner}`.catch(
      () => {},
    );
  }
}
