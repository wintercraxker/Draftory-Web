import "server-only";
import { recoverUnscoredPostLaunch } from "./post-launch-recovery";
import { terminalMatchCondition } from "../../../apps/dota-worker/terminal-authority.mjs";
import {
  scopeFilter,
  scopeRequired,
  platformAuthorizationEnabled,
} from "../../../apps/dota-worker/attempt-authorization.mjs";
import { authorizationExecutor } from "./attempt-authorization";
import { prisma } from "../prisma";
import {
  finalizeCachedResult,
  queueTerminalCleanup,
} from "./result-repository";
import { synchronizeMatchAnalytics } from "./match-analytics-repository";
import { settleFreePredictions } from "./predictions-repository";
import { settleExistingPredictions } from "./points-repository";

export async function sweepMatchResults(db = prisma) {
  const executor = authorizationExecutor(db);
  const scoped = await scopeRequired(executor);
  if (scoped) {
    const table = await executor.query(
      `SELECT to_regclass('"DotaAttemptAuthorization"')::text AS present`,
    );
    if (!table.rows[0]?.present) return 0;
  }
  if (
    (!scoped || platformAuthorizationEnabled()) &&
    process.env.DRAFTORY_ENABLE_DOTA_RESULTS !== "true"
  )
    return 0;
  const authorized = await scopeFilter(executor, "m", "result");
  if (process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY === "true") {
    const failed = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT m.id FROM "Match" m JOIN "DotaLaunchControl" c ON c."matchId"=m.id WHERE m.status IN ('QUEUED','IN_PROGRESS') AND c.status='STARTED' AND ((c."warningJournal"->'LIFECYCLE'->>'state'='POSTGAME' AND (c."warningJournal"->'LIFECYCLE'->>'matchOutcome')::int BETWEEN 64 AND 69) OR (c."warningJournal"->'GC_DETAILS'->>'source'='GC' AND c."warningJournal"->'GC_DETAILS'->>'code' IN ('AVAILABLE','PARTIAL') AND (c."warningJournal"->'GC_DETAILS'->'snapshot'->>'match_outcome')::int BETWEEN 64 AND 69)) AND ${authorized} ORDER BY m.id LIMIT 20`,
    );
    for (const attempt of failed)
      await recoverUnscoredPostLaunch(attempt.id, db);
  }
  const [capability] = await db.$queryRaw<
    { present: string | null }[]
  >`SELECT to_regclass('"DotaTerminalCleanup"')::text present`;
  if (capability.present) {
    const terminals = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT m.id FROM "Match" m JOIN "DotaLobby" l ON l."matchId"=m.id LEFT JOIN "DotaTerminalCleanup" t ON t."lobbyId"=l.id WHERE ${terminalMatchCondition()} AND l.state IN ('CONFIRMED','RECONCILING') AND t."lobbyId" IS NULL AND ${authorized} ORDER BY m.id LIMIT 20`,
    );
    for (const m of terminals) {
      const allowed = await executor.query(
        `SELECT m.id FROM "Match" m WHERE m.id=$1 AND ${authorized}`,
        [m.id],
      );
      if (allowed.rowCount)
        await db.$transaction(async (tx) => {
          const row = await tx.match.findUniqueOrThrow({ where: { id: m.id } });
          if (!row.roomId) return;
          await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${row.roomId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${row.id} FOR UPDATE`;
          const queued = await queueTerminalCleanup(tx, m.id);
          if (queued && row.status === "IN_PROGRESS") {
            const room = await tx.room.update({
              where: { id: row.roomId },
              data: { phase: "FINISHED", revision: { increment: 1 } },
            });
            await tx.roomEvent.create({
              data: {
                roomId: room.id,
                revision: room.revision,
                type: "MATCH_ACTIVITY_ENDED",
                payload: {
                  matchId: m.id,
                  source: "GC",
                  result: "PENDING",
                  rewards: false,
                },
              },
            });
          }
        });
    }
  }
  // Do not let twenty old/private/unavailable matches starve newer attempts.
  // Only expired/unleased caches or unfinished settlements enter this batch.
  const eligible = await db.$queryRawUnsafe<
    { id: string }[]
  >(`SELECT m.id FROM "Match" m
    JOIN "MatchExternalLink" link ON link."matchId"=m.id LEFT JOIN "MatchAnalyticsCache" c ON c."matchId"=m.id
    WHERE m."roomId" IS NOT NULL AND ${authorized} AND (
      m.status='IN_PROGRESS' AND (EXISTS(SELECT 1 FROM "DotaLaunchControl" gc WHERE gc."matchId"=m.id AND gc.status='STARTED' AND gc."externalMatchId"=link."dotaMatchId" AND gc."warningJournal"->'GC_DETAILS'->>'code' IN ('AVAILABLE','PARTIAL') AND gc."warningJournal"->'GC_DETAILS'->>'obtainedAt' IS DISTINCT FROM c.normalized->'reconciliation'->>'gcObtainedAt') OR c."matchId" IS NULL OR (
        COALESCE((c.normalized->'reconciliation'->>'attempts')::int,0)<24 AND (c."expiresAt" IS NULL OR c."expiresAt"<=now()) AND (c."retryAfter" IS NULL OR c."retryAfter"<=now()) AND (c."leaseUntil" IS NULL OR c."leaseUntil"<=now())))
      OR (m.status='COMPLETED' AND m."verifiedAt" IS NOT NULL OR m.status='CANCELLED') AND EXISTS (SELECT 1 FROM "Prediction" p WHERE p."matchId"=m.id AND p.status='PENDING'))
    ORDER BY COALESCE(c."fetchedAt",m."createdAt" AT TIME ZONE 'UTC'),m.id LIMIT 20`);
  const matches = await db.match.findMany({
    where: { id: { in: eligible.map((m) => m.id) } },
    select: {
      id: true,
      status: true,
      _count: { select: { players: true } },
      players: { take: 1, select: { userId: true } },
    },
  });
  let completed = 0;
  for (const m of matches) {
    if (!m.players[0]) continue;
    try {
      if (m.status === "CANCELLED") {
        await settleFreePredictions(m.id, db);
        if (m._count.players === 10) await settleExistingPredictions(m.id, db);
        continue;
      }
      let result = await finalizeCachedResult(m.id, db);
      if (!result.applied && result.reason !== "ALREADY_COMPLETED") {
        // Existing budget, lease, cache TTL and backoff prevent provider polling.
        await synchronizeMatchAnalytics(db, m.players[0].userId, m.id);
        result = await finalizeCachedResult(m.id, db);
      }
      if (result.applied) completed++;
      if (result.applied || result.reason === "ALREADY_COMPLETED")
        await settleFreePredictions(m.id, db);
      if (
        (result.applied || result.reason === "ALREADY_COMPLETED") &&
        m._count.players === 10
      )
        await settleExistingPredictions(m.id, db);
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[A-Z0-9_]{1,60}$/.test(error.code)
          ? error.code
          : "RECONCILIATION_FAILED";
      console.warn("DRAFTORY_RESULT_REQUIRES_REVIEW", { matchId: m.id, code });
    }
  }
  return completed;
}
const timers = globalThis as typeof globalThis & {
  draftoryResultSweeper?: ReturnType<typeof setInterval>;
};
export function startResultSweeper() {
  if (timers.draftoryResultSweeper) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await sweepMatchResults();
    } catch {
      console.warn("DRAFTORY_RESULT_SWEEP_UNAVAILABLE");
    } finally {
      busy = false;
    }
  };
  timers.draftoryResultSweeper = setInterval(() => void tick(), 60000);
  timers.draftoryResultSweeper.unref();
  void tick();
}
