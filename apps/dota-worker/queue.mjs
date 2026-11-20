import {
  continuationClaimFilter,
  consumeContinuation,
} from "./continuation.mjs";
import {
  approvedPlayerCancellation,
  requirePlayerCancellationSchema,
} from "./player-cancellation.mjs";
// Server-only queue. Producer uses the web transaction; consumer uses a restricted DB role.
import {
  newId,
  validateRoster,
  leaseSeconds,
  safeErrors,
  backoffSeconds,
} from "./contracts.mjs";
import { roomFormat } from "../../src/lib/rooms/lobby-options.mjs";
import { randomInt } from "node:crypto";
export const newLobbyName = () => `Sala Draftory ${randomInt(100000, 1000000)}`;
import { observedTeam } from "./presence.mjs";
import { botNonPlaying } from "./bot-position.mjs";
import {
  botHealthEnabled,
  readBotCapacity,
  botsOfflineMessage,
} from "./shared-health.mjs";
import { cancellationCommitCondition } from "./capacity-retention.mjs";
import {
  assertAuthorizedRoster,
  assertAttempt,
  consumeAuthorization,
  scopeFilter,
} from "./attempt-authorization.mjs";

async function transaction(pool, action) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await action(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

// Called from the authoritative ready transaction using its transaction client.
// Room lock is the same lock used by the competitive repository/cancellation.
export async function enqueueCreate(db, matchId, nameFactory = newLobbyName) {
  if (process.env.VERCEL_ENV === "preview")
    throw Error("PREVIEW_COMPETITIVE_DISABLED");
  if (
    !(
      process.env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
      process.env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS"
    ) &&
    botHealthEnabled() &&
    !(await readBotCapacity(db)).some((b) => b.state === "HEALTHY")
  )
    throw Object.assign(Error(botsOfflineMessage), {
      code: "DOTA_BOTS_UNAVAILABLE",
    });
  const { rows: attempts } = await db.query(
    `SELECT m.id, m.status, m.mode, r.phase
    FROM "Match" m JOIN "Room" r ON r.id=m."roomId" WHERE m.id=$1 FOR UPDATE OF r,m`,
    [matchId],
  );
  if (attempts[0]?.status !== "QUEUED" || attempts[0]?.phase !== "PREPARING")
    throw new Error("ATTEMPT_NOT_ELIGIBLE");
  const { rows: ready } = await db.query(
    `SELECT rc.status, count(rp."userId")::int AS total,
    count(rp."confirmedAt")::int AS confirmed FROM "ReadyCheck" rc
    JOIN "ReadyCheckPlayer" rp ON rp."readyCheckId"=rc.id WHERE rc."matchId"=$1 GROUP BY rc.id`,
    [matchId],
  );
  if (
    ready[0]?.status !== "PASSED" ||
    ready[0].total !== roomFormat(attempts[0].mode).players ||
    ready[0].confirmed !== roomFormat(attempts[0].mode).players
  )
    throw new Error("READY_REQUIRED");
  const { rows: roster } = await db.query(
    `SELECT p."userId",p."teamSide",p.slot,u."steamId"
    FROM "MatchPlayer" p JOIN "User" u ON u.id=p."userId" WHERE p."matchId"=$1`,
    [matchId],
  );
  validateRoster(roster, attempts[0].mode);
  const region = (
    await db.query('SELECT region FROM "Match" WHERE id=$1', [matchId])
  ).rows[0]?.region;
  await assertAuthorizedRoster(db, {
    matchId,
    mode: attempts[0].mode,
    region,
    players: roster,
  });
  await consumeAuthorization(db, matchId);
  const capability = await db.query(
    `SELECT count(*)=2 AS ready FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='DotaLobby' AND column_name IN ('publicName','credentialsEnvelope')`,
  );
  if (!capability.rows[0]?.ready)
    throw new Error("LOBBY_NAME_MIGRATION_REQUIRED");
  const lobbyId = newId(),
    correlationId = newId();
  let reserved = false;
  for (let attempt = 0; attempt < 64; attempt++) {
    const name = nameFactory();
    if (!/^Sala Draftory [1-9][0-9]{5}$/.test(name))
      throw Error("INVALID_LOBBY_PUBLIC_NAME");
    const inserted = await db.query(
      `INSERT INTO "DotaLobby" (id,"matchId","correlationId","publicName")
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
      [lobbyId, matchId, correlationId, name],
    );
    if (inserted.rowCount) {
      reserved = true;
      break;
    }
    const existing = await db.query(
      'SELECT id FROM "DotaLobby" WHERE "matchId"=$1',
      [matchId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }
  if (!reserved) throw Error("LOBBY_NAME_RESERVATION_EXHAUSTED");
  for (const p of roster)
    await db.query(
      `INSERT INTO "DotaLobbyPlayer" ("lobbyId","matchId","userId","steamId",team,slot)
    VALUES ($1,$2,$3,$4,$5,$6)`,
      [lobbyId, matchId, p.userId, p.steamId, p.teamSide, p.slot],
    );
  await db.query(
    `INSERT INTO "DotaJob" (id,"lobbyId",kind,"idempotencyKey") VALUES ($1,$2,'CREATE_LOBBY',$3)`,
    [newId(), lobbyId, `create:${matchId}`],
  );
  return lobbyId;
}

export function claim(pool, workerId) {
  return transaction(pool, async (db) => {
    const startScope = await scopeFilter(db, "m", "operate");
    const continuationScope = await scopeFilter(db, "m", "continue");
    const worker = await db.query(
      'SELECT id FROM "DotaWorker" WHERE id=$1 AND enabled FOR UPDATE SKIP LOCKED',
      [workerId],
    );
    if (!worker.rowCount) return null;
    if (
      (
        await db.query(
          `SELECT j.id FROM "DotaJob" j WHERE j."workerId"=$1 AND (j.status='LEASED' OR (${cancellationCommitCondition("j")}))`,
          [workerId],
        )
      ).rowCount
    )
      return null;
    // In the isolated SQL deployment only this narrow definer function may
    // release another account's never-sent stale reservation. Normal writes
    // below remain subject to per-login RLS. No SQL text/worker id is supplied.
    if (process.env.DRAFTORY_DATABASE_BACKEND === "neon") {
      await db.query("SELECT public.draftory_requeue_unsent()");
    }
    // A dead bot may have claimed a CREATE before any external send. Only
    // that fenced, still-QUEUED reservation may return to the shared queue.
    // A dispatched CREATE, RECONCILE/CANCELLING state or live lease remains
    // pinned to its original account regardless of heartbeat age.
    const unsent = await db.query(
      `SELECT j.id,l.id AS "lobbyId",l."workerId" FROM "DotaJob" j JOIN "DotaLobby" l ON l.id=j."lobbyId" JOIN "DotaWorker" old ON old.id=l."workerId" JOIN "Match" m ON m.id=l."matchId"
       WHERE j.kind='CREATE_LOBBY' AND j.status='PENDING' AND j."dispatchedAt" IS NULL AND j."leaseToken" IS NULL AND j."leaseUntil" IS NULL
       AND l.state='QUEUED' AND l."lobbyId" IS NULL AND l."gcConfirmedAt" IS NULL AND l."workerId"<>$1
       AND old."heartbeatAt" IS NOT NULL AND old."heartbeatAt"<=now()-interval '120 seconds' AND m.status='QUEUED' AND ${startScope}
       AND NOT EXISTS(SELECT 1 FROM "DotaJob" conflicting WHERE conflicting."lobbyId"=l.id AND (conflicting."dispatchedAt" IS NOT NULL OR conflicting.status IN ('LEASED','RECONCILE')))
       ORDER BY j."createdAt" FOR UPDATE OF j,l SKIP LOCKED LIMIT 100`,
      [workerId],
    );
    for (const abandoned of unsent.rows) {
      await db.query(
        `UPDATE "DotaJob" SET "workerId"=NULL WHERE id=$1 AND status='PENDING' AND "dispatchedAt" IS NULL`,
        [abandoned.id],
      );
      await db.query(
        `UPDATE "DotaLobby" SET "workerId"=NULL WHERE id=$1 AND state='QUEUED' AND "workerId"=$2`,
        [abandoned.lobbyId, abandoned.workerId],
      );
    }
    const continuationGate = await continuationClaimFilter(db);
    const { rows } = await db.query(
      `SELECT j.* FROM "DotaJob" j JOIN "DotaLobby" l ON l.id=j."lobbyId"
      JOIN "Match" m ON m.id=l."matchId"
      WHERE j.status='PENDING' ${continuationGate} AND j."availableAt"<=now() AND j.attempts<j."maxAttempts"
      AND ((j.kind='CANCEL_LOBBY' AND ${continuationScope}) OR (j.kind<>'CANCEL_LOBBY' AND ${startScope}))
      AND (l."workerId"=$1 OR (l."workerId" IS NULL AND NOT EXISTS
        (SELECT 1 FROM "DotaLobby" occupied WHERE occupied."workerId"=$1 AND occupied.state NOT IN ('CANCELLED','CLOSED','FAILED'))))
      AND NOT EXISTS (
        SELECT 1 FROM "DotaLobby" occupied
        WHERE occupied."workerId"=$1 AND occupied.id<>l.id
          AND occupied.state NOT IN ('CANCELLED','CLOSED','FAILED')
      )
      AND NOT EXISTS (
        SELECT 1 FROM "DotaJob" busy
        WHERE busy."workerId"=$1 AND busy.id<>j.id
          AND busy.status IN ('LEASED','RECONCILE')
      )
      ${botHealthEnabled() ? `AND (l."workerId"=$1 OR EXISTS(SELECT 1 FROM "DotaWorkerHealth" h WHERE h."workerId"=$1 AND h."observedAt">clock_timestamp()-interval '20 seconds' AND h."supervisorAt">clock_timestamp()-interval '20 seconds' AND h."supervisorActive" AND h."workerActive" AND NOT h."idleOnly" AND h."steamConnected" AND h."gcConnected" AND h.reconciled AND NOT h.draining AND h."healthySince"<=clock_timestamp()-interval '10 seconds'))` : ""}
      AND (j.kind='CANCEL_LOBBY' OR m.status NOT IN ('CANCELLED','COMPLETED'))
      AND (j.kind<>'CREATE_LOBBY' OR l.state='QUEUED')
      AND (j.kind<>'INVITE_PLAYERS' OR m.status='QUEUED' AND l.state='CONFIRMED')
      ORDER BY CASE WHEN j.kind='CANCEL_LOBBY' THEN 0 ELSE 1 END,j."createdAt"
      FOR UPDATE OF j,l SKIP LOCKED LIMIT 1`,
      [workerId],
    );
    if (!rows.length) return null;
    const job = rows[0],
      token = newId();
    await db.query(`UPDATE "DotaLobby" SET "workerId"=$2 WHERE id=$1`, [
      job.lobbyId,
      workerId,
    ]);
    const result = await db.query(
      `UPDATE "DotaJob" SET status='LEASED',"workerId"=$2,"leaseToken"=$3,
      "leaseUntil"=now()+$4*interval '1 second',attempts=attempts+1 WHERE id=$1 RETURNING *`,
      [job.id, workerId, token, leaseSeconds],
    );
    const binding = (
      await db.query('SELECT "matchId" FROM "DotaLobby" WHERE id=$1', [
        job.lobbyId,
      ])
    ).rows[0];
    if (job.kind === "CREATE_LOBBY" && binding)
      await consumeContinuation(db, binding.matchId);
    return result.rows[0];
  });
}

// Persist BEFORE any GC send. A crash after this marker is an ambiguous external effect.
export async function markDispatched(pool, job) {
  return transaction(pool, async (db) => {
    const binding = (
      await db.query('SELECT "matchId" FROM "DotaLobby" WHERE id=$1', [
        job.lobbyId,
      ])
    ).rows[0];
    if (binding)
      await assertAttempt(
        db,
        binding.matchId,
        job.kind === "CANCEL_LOBBY" ? "continue" : "operate",
      );
    const { rows: current } = await db.query(
      `SELECT j.kind,m.status,r.phase FROM "DotaJob" j
      JOIN "DotaLobby" l ON l.id=j."lobbyId" JOIN "Match" m ON m.id=l."matchId"
      JOIN "Room" r ON r.id=m."roomId" WHERE j.id=$1 FOR UPDATE OF j,l`,
      [job.id],
    );
    if (
      !current.length ||
      (current[0].kind !== "CANCEL_LOBBY" &&
        ["CANCELLED", "COMPLETED"].includes(current[0].status))
    )
      throw new Error("ATTEMPT_NOT_ELIGIBLE");
    if (current[0].kind === "INVITE_PLAYERS" && current[0].status !== "QUEUED")
      throw new Error("ATTEMPT_NOT_ELIGIBLE");
    if (current[0].kind === "CREATE_LOBBY" && current[0].phase !== "PREPARING")
      throw new Error("ATTEMPT_NOT_ELIGIBLE");
    const result = await db.query(
      `UPDATE "DotaJob" SET "dispatchedAt"=now()
      WHERE id=$1 AND status='LEASED' AND "leaseToken"=$2 AND "workerId"=$3 AND "leaseUntil">now()
      AND "dispatchedAt" IS NULL RETURNING "lobbyId"`,
      [job.id, job.leaseToken, job.workerId],
    );
    if (!result.rowCount) throw new Error("STALE_OR_DISPATCHED_LEASE");
    if (current[0].kind === "CREATE_LOBBY")
      await db.query(`UPDATE "DotaLobby" SET state='CREATING' WHERE id=$1`, [
        job.lobbyId,
      ]);
  });
}

export async function renew(pool, job) {
  const result = await pool.query(
    `UPDATE "DotaJob" SET "leaseUntil"=now()+$4*interval '1 second'
    WHERE id=$1 AND status='LEASED' AND "leaseToken"=$2 AND "workerId"=$3 AND "leaseUntil">now()`,
    [job.id, job.leaseToken, job.workerId, leaseSeconds],
  );
  if (!result.rowCount) throw new Error("STALE_LEASE");
}

export function recoverExpired(pool) {
  return transaction(pool, async (db) => {
    const authorized = await scopeFilter(db, "m", "continue");
    const { rows } = await db.query(
      `SELECT j.* FROM "DotaJob" j JOIN "DotaLobby" l ON l.id=j."lobbyId" JOIN "Match" m ON m.id=l."matchId" WHERE j.status='LEASED' AND j."leaseUntil"<=now() AND ${authorized} FOR UPDATE OF j SKIP LOCKED`,
    );
    for (const job of rows) {
      const ambiguous =
        job.kind === "CANCEL_LOBBY" ||
        (job.kind === "CREATE_LOBBY" && job.dispatchedAt !== null);
      const exhausted = job.attempts >= job.maxAttempts;
      await db.query(
        `UPDATE "DotaJob" SET status=$2,"leaseToken"=NULL,"leaseUntil"=NULL,
        "availableAt"=now()+$3*interval '1 second',"errorCode"=$4,
        "dispatchedAt"=CASE WHEN $2='RECONCILE' THEN "dispatchedAt" ELSE NULL END WHERE id=$1`,
        [
          job.id,
          ambiguous ? "RECONCILE" : exhausted ? "FAILED" : "PENDING",
          backoffSeconds(job.attempts),
          job.kind === "CANCEL_LOBBY"
            ? exhausted
              ? "ATTEMPTS_EXHAUSTED"
              : "DISCONNECTED"
            : ambiguous
              ? "AMBIGUOUS_CREATE"
              : exhausted
                ? "ATTEMPTS_EXHAUSTED"
                : "TIMEOUT",
        ],
      );
      if (ambiguous && job.kind === "CREATE_LOBBY")
        await db.query(
          `UPDATE "DotaLobby" SET state='RECONCILING' WHERE id=$1`,
          [job.lobbyId],
        );
      else if (exhausted && job.kind === "CREATE_LOBBY")
        await db.query(`UPDATE "DotaLobby" SET state='FAILED' WHERE id=$1`, [
          job.lobbyId,
        ]);
    }
    return rows.length;
  });
}

export async function acknowledge(pool, job) {
  // Transport must first persist correlated GC evidence in the SAME transaction.
  // CREATE requires the dedicated correlated-evidence path, never a transport acknowledgement.
  const stored = await pool.query('SELECT kind FROM "DotaJob" WHERE id=$1', [
    job.id,
  ]);
  if (stored.rows[0]?.kind === "CREATE_LOBBY")
    throw new Error("GC_EVIDENCE_ADAPTER_REQUIRED");
  const result = await pool.query(
    `UPDATE "DotaJob" SET status='SUCCEEDED',"completedAt"=now(),"leaseToken"=NULL,"leaseUntil"=NULL
    WHERE id=$1 AND status='LEASED' AND "leaseToken"=$2 AND "workerId"=$3 AND "leaseUntil">now() AND "dispatchedAt" IS NOT NULL`,
    [job.id, job.leaseToken, job.workerId],
  );
  if (!result.rowCount) throw new Error("STALE_LEASE");
}

export function sanitizeError(code) {
  return safeErrors.includes(code) ? code : "DISCONNECTED";
}

function lobbyObservation(value, expectedBot) {
  if (
    !value ||
    typeof value.lobbyId !== "string" ||
    !/^\d{1,20}$/.test(value.lobbyId) ||
    value.ownerSteamId !== expectedBot ||
    !Array.isArray(value.members) ||
    value.members.length > 64
  )
    throw new Error("UNTRUSTED_GC_OBSERVATION");
  if (
    value.members.some(
      (p) => typeof p.steamId !== "string" || !/^\d{17}$/.test(p.steamId),
    ) ||
    new Set(value.members.map((p) => p.steamId)).size !== value.members.length
  )
    throw new Error("UNTRUSTED_GC_OBSERVATION");
  return value;
}
export function completeCreate(pool, job, evidence) {
  return transaction(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT j.*,l."lobbyId" AS "actualLobbyId",l.state AS "lobbyState",l."workerId" AS "boundWorker",w."steamId" AS "botSteamId"
      FROM "DotaJob" j JOIN "DotaLobby" l ON l.id=j."lobbyId" JOIN "DotaWorker" w ON w.id=l."workerId"
      WHERE j.id=$1 FOR UPDATE OF j,l`,
      [job.id],
    );
    const current = rows[0];
    if (
      !current ||
      current.kind !== "CREATE_LOBBY" ||
      current.boundWorker !== job.workerId
    )
      throw new Error("STALE_LEASE");
    lobbyObservation(evidence, current.botSteamId);
    if (current.status === "SUCCEEDED") {
      if (current.actualLobbyId !== evidence.lobbyId)
        throw new Error("GC_LOBBY_MISMATCH");
      return;
    }
    const lease =
      current.status === "LEASED" &&
      current.leaseToken === job.leaseToken &&
      current.leaseUntil > new Date();
    if (!lease && current.status !== "RECONCILE")
      throw new Error("STALE_LEASE");
    if (current.dispatchedAt === null)
      throw new Error("GC_CONFIRMATION_WITHOUT_DISPATCH");
    if (!["CREATING", "RECONCILING", "CANCELLING"].includes(current.lobbyState))
      throw new Error("STALE_LOBBY");
    if (current.actualLobbyId && current.actualLobbyId !== evidence.lobbyId)
      throw new Error("GC_LOBBY_MISMATCH");
    await db.query(
      // An ambiguous CREATE may be confirmed after cancellation won the Room
      // transaction. Preserve that cancellation while retaining the real GC ID
      // needed for safe cleanup; never reopen invitation/Launch processing.
      `UPDATE "DotaLobby" SET state=CASE WHEN state='CANCELLING' THEN 'CANCELLING' ELSE 'CONFIRMED' END,"lobbyId"=$2,"gcConfirmedAt"=COALESCE("gcConfirmedAt",now()) WHERE id=$1`,
      [job.lobbyId, evidence.lobbyId],
    );
    await db.query(
      `UPDATE "DotaJob" SET status='SUCCEEDED',"completedAt"=now(),"leaseToken"=NULL,"leaseUntil"=NULL,"errorCode"=NULL WHERE id=$1`,
      [job.id],
    );
  });
}
export function recordPresence(pool, workerId, lobbyId, evidence) {
  return transaction(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT l.*,w."steamId" AS "botSteamId" FROM "DotaLobby" l JOIN "DotaWorker" w ON w.id=l."workerId" WHERE l.id=$1 AND l."workerId"=$2 FOR UPDATE OF l`,
      [lobbyId, workerId],
    );
    const lobby = rows[0];
    if (!lobby || !["CONFIRMED", "RECONCILING"].includes(lobby.state))
      throw new Error("STALE_LOBBY");
    lobbyObservation(evidence, lobby.botSteamId);
    if (lobby.lobbyId !== evidence.lobbyId)
      throw new Error("GC_LOBBY_MISMATCH");
    if (evidence.rosterComplete !== true) {
      await db.query(`UPDATE "DotaLobby" SET state='RECONCILING' WHERE id=$1`, [
        lobbyId,
      ]);
      return;
    }
    // Clear only after a complete, positively correlated SO. Never overwrite frozen team/slot.
    await db.query(
      `UPDATE "DotaLobbyPlayer" SET "observedAt"=NULL,"observedTeam"=NULL WHERE "lobbyId"=$1`,
      [lobbyId],
    );
    const { rows: roster } = await db.query(
      `SELECT "steamId" FROM "DotaLobbyPlayer" WHERE "lobbyId"=$1`,
      [lobbyId],
    );
    const observer = evidence.members.find(
      (m) => m.steamId === lobby.botSteamId,
    );
    const extraPlayer =
      !botNonPlaying(observer) ||
      evidence.members.some(
        (m) =>
          !roster.some((p) => p.steamId === m.steamId) &&
          m.steamId !== lobby.botSteamId,
      );
    // Preserve the human's actual team even when the bot/another member makes the overall roster unsafe.
    // Global confirmation is separately withheld by RECONCILING; unknown is never promoted to a team.
    for (const member of evidence.members)
      await db.query(
        `UPDATE "DotaLobbyPlayer" SET "observedAt"=now(),"observedTeam"=$3::"MatchSide" WHERE "lobbyId"=$1 AND "steamId"=$2`,
        [lobbyId, member.steamId, observedTeam(member.teamCode)],
      );
    // GC slot is preserved in the adapter observation, but its numbering is not
    // promoted to observedSlot (1..5) until verified experimentally. Unknown != zero.
    await db.query(
      `UPDATE "DotaLobby" SET state=$2,"lastObservedAt"=now() WHERE id=$1`,
      [lobbyId, extraPlayer ? "RECONCILING" : "CONFIRMED"],
    );
  });
}
export async function markDisconnected(pool, workerId, lobbyId) {
  await pool.query(
    `UPDATE "DotaLobby" SET state='RECONCILING' WHERE id=$1 AND "workerId"=$2 AND state IN ('CONFIRMED','CREATING')`,
    [lobbyId, workerId],
  );
  // Never clear a roster on transport loss; it is last-known evidence, not observed absence.
}
export async function deferJob(pool, job, code = "DISCONNECTED") {
  await transaction(pool, async (db) => {
    const result = await db.query(
      `UPDATE "DotaJob" SET status=CASE WHEN kind='CANCEL_LOBBY' OR kind='CREATE_LOBBY' AND "dispatchedAt" IS NOT NULL THEN 'RECONCILE'
      WHEN attempts>="maxAttempts" THEN 'FAILED' ELSE 'PENDING' END,
      "leaseUntil"=NULL,"leaseToken"=NULL,"errorCode"=$4,"availableAt"=now()+$5*interval '1 second',
      "dispatchedAt"=CASE WHEN kind IN ('CREATE_LOBBY','CANCEL_LOBBY') THEN "dispatchedAt" ELSE NULL END
      WHERE id=$1 AND status='LEASED' AND "workerId"=$2 AND "leaseToken"=$3 RETURNING status`,
      [
        job.id,
        job.workerId,
        job.leaseToken,
        sanitizeError(code),
        backoffSeconds(job.attempts),
      ],
    );
    if (result.rows[0]?.status === "RECONCILE" && job.kind === "CREATE_LOBBY")
      await db.query(`UPDATE "DotaLobby" SET state='RECONCILING' WHERE id=$1`, [
        job.lobbyId,
      ]);
    if (result.rows[0]?.status === "FAILED" && job.kind === "CREATE_LOBBY")
      await db.query(`UPDATE "DotaLobby" SET state='FAILED' WHERE id=$1`, [
        job.lobbyId,
      ]);
  });
}

// Cancellation producer: invoke within the authoritative 8/10 transaction.
export async function enqueueCancel(db, matchId) {
  const locked = await db.query(
    `SELECT m.status FROM "Match" m JOIN "Room" r ON r.id=m."roomId"
    WHERE m.id=$1 FOR UPDATE OF r,m`,
    [matchId],
  );
  if (locked.rows[0]?.status !== "CANCELLED")
    throw new Error("CANCELLED_ATTEMPT_REQUIRED");
  const launched = await db.query(
    `SELECT "matchId" FROM "DotaLaunchControl" WHERE "matchId"=$1 AND (status IN ('DISPATCHED','STARTED') OR "launchRequestId" IS NOT NULL OR "externalMatchId" IS NOT NULL) FOR UPDATE`,
    [matchId],
  );
  if (launched.rowCount) {
    await requirePlayerCancellationSchema(db);
    const approved = await db.query(
      `SELECT "matchId" FROM "DotaLaunchControl" c WHERE c."matchId"=$1 AND (${approvedPlayerCancellation()})`,
      [matchId],
    );
    if (!approved.rowCount) throw Error("LAUNCH_RECONCILIATION_REQUIRED");
  }
  const { rows } = await db.query(
    'SELECT * FROM "DotaLobby" WHERE "matchId"=$1 FOR UPDATE',
    [matchId],
  );
  if (!rows.length) return null;
  const lobby = rows[0];
  // Revocation fences late writes. Cannot undo an already-sent external command.
  const dispatched = await db.query(
    `SELECT id FROM "DotaJob" WHERE "lobbyId"=$1
    AND kind='CREATE_LOBBY' AND "dispatchedAt" IS NOT NULL`,
    [lobby.id],
  );
  await db.query(
    `UPDATE "DotaJob" SET status=CASE WHEN kind='CREATE_LOBBY' AND "dispatchedAt" IS NOT NULL THEN 'RECONCILE' ELSE 'CANCELLED' END,"leaseToken"=NULL,"leaseUntil"=NULL,
    "errorCode"=CASE WHEN kind='CREATE_LOBBY' AND "dispatchedAt" IS NOT NULL THEN 'AMBIGUOUS_CREATE' ELSE "errorCode" END
    WHERE "lobbyId"=$1 AND kind<>'CANCEL_LOBBY' AND status IN ('PENDING','LEASED')`,
    [lobby.id],
  );
  if (!lobby.lobbyId && !dispatched.rowCount) {
    await db.query(`UPDATE "DotaLobby" SET state='CLOSED' WHERE id=$1`, [
      lobby.id,
    ]);
    return null;
  }
  // External destruction still requires GC reconciliation/ownership proof; never guess a lobby ID.
  await db.query(`UPDATE "DotaLobby" SET state='CANCELLING' WHERE id=$1`, [
    lobby.id,
  ]);
  await db.query(
    `INSERT INTO "DotaJob" (id,"lobbyId",kind,"idempotencyKey")
    VALUES ($1,$2,'CANCEL_LOBBY',$3) ON CONFLICT ("idempotencyKey") DO NOTHING`,
    [newId(), lobby.id, `cancel:${matchId}`],
  );
  return lobby.id;
}
