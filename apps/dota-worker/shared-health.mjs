import { continuationAvailable } from "./continuation.mjs";
// Opt-in shared evidence; all freshness/hysteresis uses the PostgreSQL clock.
import { pendingCancellationCommitSql } from "./capacity-retention.mjs";
export const botHealthEnabled = (env = process.env) =>
  env.DRAFTORY_ENABLE_SHARED_BOT_HEALTH === "true" ||
  env.DRAFTORY_DATABASE_BACKEND === "neon" ||
  env.VERCEL === "1";
export async function publishSupervisorHealth(
  db,
  workerId,
  active,
  env = process.env,
) {
  if (!botHealthEnabled(env)) return;
  const r = await db.query(
    'UPDATE "DotaWorkerHealth" SET "supervisorAt"=clock_timestamp(),"supervisorActive"=$2 WHERE "workerId"=$1',
    [workerId, !!active],
  );
  if (r.rowCount !== 1) throw Error("SHARED_WORKER_HEALTH_ROW_REQUIRED");
}
export async function publishWorkerHealth(
  db,
  workerId,
  health,
  env = process.env,
) {
  if (!botHealthEnabled(env)) return;
  const result = await db.query(
    `UPDATE "DotaWorkerHealth" SET "observedAt"=clock_timestamp(),
 "workerActive"=$3,"idleOnly"=$4,"steamConnected"=$5,"gcConnected"=$6,reconciled=$7,
 "healthySince"=CASE WHEN $2 AND "supervisorActive" AND "supervisorAt">clock_timestamp()-interval '20 seconds' AND $3 AND NOT $4 AND $5 AND $6 AND $7 AND NOT draining THEN COALESCE("healthySince",clock_timestamp()) ELSE NULL END,
 "readySince"=COALESCE("readySince",clock_timestamp()) WHERE "workerId"=$1`,
    [
      workerId,
      !!health.supervisorActive,
      !!health.workerActive,
      !!health.idleOnly,
      !!health.steamConnected,
      !!health.gcConnected,
      !!health.reconciled,
    ],
  );
  if (result.rowCount !== 1) throw Error("SHARED_WORKER_HEALTH_ROW_REQUIRED");
}
export const healthSql = `SELECT w."secretRef" reference,
 CASE WHEN EXISTS(SELECT 1 FROM "DotaTerminalCleanup" t WHERE t."workerId"=w.id AND t.status='INTERVENTION_REQUIRED') THEN 'INTERVENTION_REQUIRED'
 WHEN NOT w.enabled OR w."heartbeatAt" IS NULL OR w."heartbeatAt">clock_timestamp()+interval '1 second' OR w."heartbeatAt"<=clock_timestamp()-interval '30 seconds' OR h."observedAt" IS NULL OR h."observedAt">clock_timestamp()+interval '1 second' OR h."observedAt"<=clock_timestamp()-interval '20 seconds' OR h."supervisorAt" IS NULL OR h."supervisorAt"<=clock_timestamp()-interval '20 seconds' THEN 'OFFLINE'
 WHEN EXISTS(SELECT 1 FROM "DotaLobby" l WHERE l."workerId"=w.id AND l.state NOT IN ('CLOSED','FAILED','CANCELLED')) OR ${pendingCancellationCommitSql("w.id")} THEN 'BUSY'
 WHEN h."idleOnly" OR h.draining OR NOT h."supervisorActive" OR NOT h."workerActive" THEN 'DEGRADED'
 WHEN h."readySince" IS NULL OR NOT h.reconciled THEN 'STARTING'
 WHEN h."supervisorActive" AND h."workerActive" AND NOT h."idleOnly" AND h."steamConnected" AND h."gcConnected" AND NOT h.draining AND h."healthySince"<=clock_timestamp()-interval '10 seconds' THEN 'HEALTHY'
 ELSE 'DEGRADED' END state,
 COALESCE(h."idleOnly",true) "idleOnly",w."heartbeatAt"
 FROM "DotaWorker" w LEFT JOIN "DotaWorkerHealth" h ON h."workerId"=w.id ORDER BY w."secretRef"`;
export async function readBotCapacity(db) {
  let sql = healthSql;
  if (await continuationAvailable(db))
    sql = sql.replace(
      'WHEN EXISTS(SELECT 1 FROM "DotaLobby"',
      `WHEN EXISTS(SELECT 1 FROM "DotaRoomContinuation" c WHERE c."workerId"=w.id AND c.state IN ('WAITING_CLEANUP','RESERVED','BOUND') AND (c."expiresAt" IS NULL OR c."expiresAt">clock_timestamp())) THEN 'BUSY' WHEN EXISTS(SELECT 1 FROM "DotaLobby"`,
    );
  return (await db.query(sql)).rows;
}
export async function expireUnsentQueue(db, env = process.env) {
  if (!botHealthEnabled(env)) return 0;
  // Eligible public rooms retain their frozen Ready/roster while capacity is
  // occupied/offline. A wait alone is not evidence of a failed Dota attempt.
  if (
    env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
    env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS"
  )
    return 0;
  const seconds = Number(env.DRAFTORY_UNSENT_JOB_TIMEOUT_SECONDS || 120);
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600)
    throw Error("INVALID_UNSENT_JOB_TIMEOUT");
  const r = await db.query(
    `WITH expired AS (
 SELECT j.id,l.id "lobbyId" FROM "DotaJob" j JOIN "DotaLobby" l ON l.id=j."lobbyId"
 WHERE j.kind='CREATE_LOBBY' AND j.status='PENDING' AND j."workerId" IS NULL AND j."dispatchedAt" IS NULL AND j."leaseToken" IS NULL AND j."leaseUntil" IS NULL
 AND l.state='QUEUED' AND l."workerId" IS NULL AND l."lobbyId" IS NULL AND l."gcConfirmedAt" IS NULL AND j."createdAt"<=clock_timestamp()-$1*interval '1 second'
 AND NOT EXISTS(SELECT 1 FROM "DotaJob" x WHERE x."lobbyId"=l.id AND (x."dispatchedAt" IS NOT NULL OR x.status IN ('LEASED','RECONCILE')))
 AND NOT EXISTS(SELECT 1 FROM "DotaLaunchControl" c WHERE c."lobbyId"=l.id AND c.status IN ('DISPATCHED','STARTED'))
 FOR UPDATE OF j,l SKIP LOCKED), failed AS (
 UPDATE "DotaJob" j SET status='FAILED',"errorCode"='BOT_CAPACITY_TIMEOUT',"completedAt"=clock_timestamp() FROM expired e WHERE j.id=e.id RETURNING e."lobbyId")
 UPDATE "DotaLobby" l SET state='FAILED' FROM failed f WHERE l.id=f."lobbyId" RETURNING l.id`,
    [seconds],
  );
  return r.rowCount;
}
export const botsOfflineMessage =
  "Las partidas están temporalmente no disponibles. Los bots de Dota 2 están desconectados. Puedes seguir utilizando Draftory y volver a intentarlo más tarde.";
