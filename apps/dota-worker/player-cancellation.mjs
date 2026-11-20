import { randomUUID } from "node:crypto";
// Opt-in deployment capability. A timeout never requests a cancellation.
export const playerCancellationEnabled = (env = process.env) =>
  env.DRAFTORY_ENABLE_PLAYER_CANCELLATION_RECOVERY === "true";
export function approvedPlayerCancellation(alias = "c", env = process.env) {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) throw Error("INVALID_SQL_ALIAS");
  return playerCancellationEnabled(env)
    ? `${alias}."warningJournal"->'CANCELLATION_REQUEST'->>'state'='APPROVED'`
    : "false";
}
export const noProtectedLaunch = (alias = "c", env = process.env) =>
  `NOT EXISTS(SELECT 1 FROM "DotaLaunchControl" ${alias} WHERE ${alias}."matchId"=m.id AND (${alias}."launchRequestId" IS NOT NULL OR ${alias}."externalMatchId" IS NOT NULL) AND NOT (${approvedPlayerCancellation(alias, env)}))`;
export async function requirePlayerCancellationSchema(db) {
  const row = (
    await db.query(
      "SELECT to_regprocedure('draftory_player_cancellation_capability()') IS NOT NULL present",
    )
  ).rows[0];
  if (!row?.present) throw Error("PLAYER_CANCELLATION_MIGRATION_REQUIRED");
}
export function cancellationRecoveryState({
  approved = false,
  leaving = false,
  retrying = false,
  externalConflict = false,
  launched = false,
  gameplay = false,
  available = false,
} = {}) {
  if (externalConflict) return "UNAVAILABLE_EXTERNAL_CONFLICT";
  if (approved)
    return leaving
      ? "LEAVING_LOBBY"
      : retrying
        ? "RECOVERING"
        : "CANCELLATION_REQUESTED";
  return available
    ? "AVAILABLE"
    : gameplay
      ? "IN_GAME"
      : launched
        ? "LAUNCHING"
        : "RECOVERING";
}
export async function recordCancellationExit(runtime, context, state) {
  if (!context.playerCancellation) return;
  if (
    ![
      "CANCELLATION_REQUESTED",
      "LEAVING_LOBBY",
      "RECOVERING",
      "UNAVAILABLE_EXTERNAL_CONFLICT",
      "AVAILABLE",
    ].includes(state)
  )
    throw Error("INVALID_CANCELLATION_STATE");
  await runtime.pool.query(
    `UPDATE "DotaLaunchControl" c SET "warningJournal"=jsonb_set(c."warningJournal",'{CANCELLATION_EXIT}',COALESCE(c."warningJournal"->'CANCELLATION_EXIT','{}'::jsonb)||jsonb_build_object('state',$4::text,'at',clock_timestamp()))
 FROM "DotaLobby" l WHERE c."matchId"=l."matchId" AND l.id=$1 AND l."workerId"=$2 AND l."correlationId"=$3::uuid AND c."warningJournal"->'CANCELLATION_REQUEST'->>'state'='APPROVED' AND c."warningJournal"->'CANCELLATION_EXIT'->>'state' IS DISTINCT FROM $4::text`,
    [context.id, context.worker.id, context.correlationId, state],
  );
}
// At most two additional bursts of the existing job budget, separated by the
// persisted backoff and a NEW positive membership read. Silence cannot reset it.
// After that, continue accepting receipts/observations without further SENDs.
export async function refreshPlayerCancellationBudget(runtime, context) {
  if (!context.playerCancellation) return;
  const row = (
    await runtime.pool.query(
      `SELECT j.id FROM "DotaJob" j JOIN "DotaLaunchControl" c ON c."matchId"=$3
 WHERE j."lobbyId"=$1 AND j."workerId"=$2 AND j.kind='CANCEL_LOBBY' AND j.status='RECONCILE'
 AND j.attempts>=j."maxAttempts" AND j."availableAt"<=now()
 AND COALESCE((c."warningJournal"->'CANCELLATION_EXIT'->>'retryBursts')::int,0)<2`,
      [context.id, context.worker.id, context.matchId],
    )
  ).rows[0];
  if (!row) return;
  let read;
  try {
    read = await runtime.adapter.maintenanceRead(randomUUID());
  } catch {
    return;
  }
  if (
    read?.code !== "BOT_MEMBERSHIP_CONFIRMED" ||
    read.canLeave !== true ||
    read.gcReady !== true ||
    read.correlationId !== context.correlationId ||
    read.lobbyId !== context.lobbyId ||
    read.botSteamId !== context.worker.steamId ||
    !Number.isFinite(Date.parse(read.observedAt)) ||
    Math.abs(Date.now() - Date.parse(read.observedAt)) > 30000
  )
    return;
  if (runtime.stopped || runtime.exclusiveOwner !== true) return;
  const db = await runtime.pool.connect();
  try {
    await db.query("BEGIN");
    const changed = await db.query(
      `UPDATE "DotaJob" j SET attempts=0,"errorCode"=NULL,"availableAt"=now() FROM "DotaLobby" l,"DotaLaunchControl" c
   WHERE j.id=$1 AND j."workerId"=$2 AND j.status='RECONCILE' AND j.attempts>=j."maxAttempts" AND j."availableAt"<=now() AND j."leaseToken" IS NULL AND j."leaseUntil" IS NULL
   AND l.id=j."lobbyId" AND l."workerId"=$2 AND l."correlationId"=$3::uuid AND l.state='CANCELLING' AND c."matchId"=l."matchId" AND c."warningJournal"->'CANCELLATION_REQUEST'->>'state'='APPROVED'
   AND COALESCE((c."warningJournal"->'CANCELLATION_EXIT'->>'retryBursts')::int,0)<2
   AND NOT EXISTS(SELECT 1 FROM "DotaJob" busy WHERE busy."workerId"=$2 AND busy.status='LEASED') RETURNING j.id`,
      [row.id, context.worker.id, context.correlationId],
    );
    if (changed.rowCount)
      await db.query(
        `UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",'{CANCELLATION_EXIT}',COALESCE("warningJournal"->'CANCELLATION_EXIT','{}'::jsonb)||jsonb_build_object('retryBursts',COALESCE(("warningJournal"->'CANCELLATION_EXIT'->>'retryBursts')::int,0)+1,'state','RECOVERING','at',clock_timestamp())) WHERE "matchId"=$1`,
        [context.matchId],
      );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
