import { randomUUID } from "node:crypto";
import { inspectTeams, rosterHash } from "./launch-policy.mjs";
import { newAttemptAutoLaunch } from "./auto-launch-config.mjs";
import { correlatedUnscoredPostgame } from "./post-launch-policy.mjs";
import {
  assertAuthorizedRoster,
  scopeRequired,
} from "./attempt-authorization.mjs";
export async function hasLaunchControl(db) {
  return !!(
    await db.query(`SELECT to_regclass('"DotaLaunchControl"')::text AS table`)
  ).rows[0]?.table;
}
export async function authorizeLaunch(
  db,
  matchId,
  actor,
  players,
  mode,
  region,
) {
  await assertAuthorizedRoster(db, { matchId, players, mode, region });
  if (!(await hasLaunchControl(db)))
    throw Error("AUTO_LAUNCH_MIGRATION_REQUIRED");
  const { rows } = await db.query(
    `SELECT r."creatorId",m.status,m.mode,m."createdAt" FROM "Match" m JOIN "Room" r ON r.id=m."roomId" WHERE m.id=$1`,
    [matchId],
  );
  if (rows[0]?.creatorId !== actor || rows[0]?.status !== "QUEUED")
    throw Error("CREATOR_ATTEMPT_REQUIRED");
  if (!(await scopeRequired(db)) && !newAttemptAutoLaunch(rows[0]))
    throw Error("NEW_ATTEMPT_AUTO_LAUNCH_CONFIGURATION_REQUIRED");
  await db.query(
    `INSERT INTO "DotaLaunchControl" ("matchId","authorizedById","rosterHash") VALUES ($1,$2,$3) ON CONFLICT ("matchId") DO NOTHING`,
    [matchId, actor, rosterHash(players, mode, region)],
  );
}
export async function bindLaunch(db, context) {
  await assertAuthorizedRoster(db, context);
  const digest = rosterHash(context.players, context.mode, context.region);
  const result = await db.query(
    `UPDATE "DotaLaunchControl" SET "lobbyId"=$2 WHERE "matchId"=$1 AND status='ARMED' AND "rosterHash"=$3 AND ("lobbyId" IS NULL OR "lobbyId"=$2) RETURNING "matchId"`,
    [context.matchId, context.id, digest],
  );
  if (!result.rowCount) throw Error("LAUNCH_AUTHORIZATION_MISMATCH");
}
export async function revokeLaunch(db, matchId) {
  if (await hasLaunchControl(db))
    await db.query(
      `UPDATE "DotaLaunchControl" SET status='REVOKED' WHERE "matchId"=$1 AND status<>'REVOKED'`,
      [matchId],
    );
}
// Serialized with cancellation on the control/lobby rows. No writes to Room/Match.
// The durable fence is committed BEFORE any external SEND; restart never retries it.
export async function controlLobby(pool, context, adapter) {
  if (context.exclusiveOwner !== true) return;
  if (
    !adapter.ready ||
    !adapter.confirmation ||
    adapter.confirmation.lobbyId !== context.lobbyId
  )
    return;
  const evidence = await adapter.refresh(); // Requires a NEW GC SO, never cached presence.
  const verdict = inspectTeams(context, evidence),
    db = await pool.connect();
  let request = null,
    warning = null;
  try {
    await db.query("BEGIN");
    await assertAuthorizedRoster(db, context);
    const { rows } = await db.query(
      `SELECT c.*,l.state,l."lobbyId" AS "gcLobbyId",m.status AS "matchStatus",r.phase,w.enabled,w."heartbeatAt">now()-interval '30 seconds' AS healthy
      FROM "DotaLaunchControl" c JOIN "DotaLobby" l ON l.id=c."lobbyId" JOIN "DotaWorker" w ON w.id=l."workerId"
      JOIN "Match" m ON m.id=c."matchId" JOIN "Room" r ON r.id=m."roomId" WHERE c."matchId"=$1 AND l."workerId"=$2 FOR UPDATE OF c,l`,
      [context.matchId, context.worker.id],
    );
    const c = rows[0];
    if (c?.warningJournal?.ROSTER_CONTROL) {
      await db.query("COMMIT");
      return;
    }
    if (
      !c ||
      c.status !== "ARMED" ||
      c.state !== "CONFIRMED" ||
      c.gcLobbyId !== context.lobbyId ||
      c.matchStatus !== "QUEUED" ||
      c.phase !== "WAITING_FOR_PLAYERS" ||
      !c.enabled ||
      !c.healthy ||
      c.rosterHash !== rosterHash(context.players, context.mode, context.region)
    ) {
      await db.query("COMMIT");
      return;
    }
    // Binding exists only through enqueueCreate's PASSED/full-ready transaction.
    // An approved cancellation vote threshold revokes this control in that same web transaction.
    if (
      (
        await db.query(
          `SELECT id FROM "DotaJob" WHERE "workerId"=$1 AND status='LEASED'`,
          [context.worker.id],
        )
      ).rowCount
    ) {
      await db.query("COMMIT");
      return;
    }
    // Changes to active composition revoke consent, rather than using old team snapshots.
    const { rows: active } = await db.query(
      `SELECT "userId",team FROM "RoomMember" WHERE "roomId"=(SELECT "roomId" FROM "Match" WHERE id=$1) AND "leftAt" IS NULL AND team IN ('RADIANT','DIRE')`,
      [context.matchId],
    );
    if (
      active.length !== context.players.length ||
      active.some(
        (p) =>
          !context.players.some(
            (f) => f.userId === p.userId && f.teamSide === p.team,
          ),
      )
    ) {
      await db.query(
        `UPDATE "DotaLaunchControl" SET status='REVOKED' WHERE "matchId"=$1`,
        [context.matchId],
      );
      await db.query("COMMIT");
      return;
    }
    const now = Date.now(),
      journal = c.warningJournal ?? {},
      old = journal[verdict.kind];
    if (
      verdict.kind &&
      verdict.kind !== c.warningSituation &&
      (!c.lastWarningAt ||
        now - new Date(c.lastWarningAt).getTime() >= 20000) &&
      (!old || now - old.at >= 60000)
    ) {
      warning = { kind: verdict.kind, id: randomUUID() };
      journal[verdict.kind] = { at: now, status: "DISPATCHED" };
      await db.query(
        `UPDATE "DotaLaunchControl" SET "warningSituation"=$2,"warningJournal"=$3,"lastWarningAt"=now() WHERE "matchId"=$1`,
        [context.matchId, verdict.kind, JSON.stringify(journal)],
      );
    }
    const stability = journal.LAUNCH_STABILITY;
    if (!verdict.ok) {
      delete journal.LAUNCH_STABILITY;
    } else if (!stability || stability.sessionId !== adapter.launchSessionId) {
      journal.LAUNCH_STABILITY = {
        at: now,
        sessionId: adapter.launchSessionId,
      };
    }
    await db.query(
      `UPDATE "DotaLaunchControl" SET "warningJournal"=$2 WHERE "matchId"=$1`,
      [context.matchId, JSON.stringify(journal)],
    );
    if (
      verdict.ok &&
      adapter.launchSessionId &&
      stability?.sessionId === adapter.launchSessionId &&
      now - stability.at >= 3000
    ) {
      request = randomUUID();
      await db.query(
        `UPDATE "DotaLaunchControl" SET status='DISPATCHED',"launchRequestId"=$2,"consumedAt"=now() WHERE "matchId"=$1`,
        [context.matchId, request],
      );
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
  if (warning) {
    let status = "FAILED";
    try {
      await adapter.warn(warning.kind, warning.id);
      status = "REQUESTED";
    } catch {}
    await pool.query(
      `UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",ARRAY[$2,'status'],to_jsonb($3::text)) WHERE "matchId"=$1`,
      [context.matchId, warning.kind, status],
    );
  }
  if (request) {
    // Recheck after chat delay AND retrieve another fresh GC SO immediately before launch.
    await adapter.refresh();
    if (!inspectTeams(context, adapter.observed).ok) return; // consumed, never retried blindly
    const gate = await pool.query(
      `SELECT c.status FROM "DotaLaunchControl" c JOIN "DotaLobby" l ON l.id=c."lobbyId" JOIN "Match" m ON m.id=c."matchId" JOIN "Room" r ON r.id=m."roomId" JOIN "DotaWorker" w ON w.id=l."workerId" WHERE c."matchId"=$1 AND c."launchRequestId"=$2 AND c.status='DISPATCHED' AND NOT(c."warningJournal" ? 'ROSTER_CONTROL') AND l.state='CONFIRMED' AND m.status='QUEUED' AND r.phase='WAITING_FOR_PLAYERS' AND w.enabled AND w."heartbeatAt">now()-interval '30 seconds'`,
      [context.matchId, request],
    );
    if (gate.rowCount) {
      const fence = await pool.connect();
      try {
        await fence.query("BEGIN");
        await assertAuthorizedRoster(fence, context);
        const current = await fence.query(
          `SELECT c.status FROM "DotaLaunchControl" c JOIN "DotaLobby" l ON l.id=c."lobbyId" JOIN "Match" m ON m.id=c."matchId" JOIN "Room" r ON r.id=m."roomId" JOIN "DotaWorker" w ON w.id=l."workerId" WHERE c."matchId"=$1 AND c."launchRequestId"=$2 AND c.status='DISPATCHED' AND NOT(c."warningJournal" ? 'ROSTER_CONTROL') AND l.state='CONFIRMED' AND m.status='QUEUED' AND r.phase='WAITING_FOR_PLAYERS' AND w.enabled AND w."heartbeatAt">now()-interval '30 seconds' FOR UPDATE OF c,l`,
          [context.matchId, request],
        );
        if (current.rowCount) {
          const active = await fence.query(
            `SELECT "userId",team FROM "RoomMember" WHERE "roomId"=(SELECT "roomId" FROM "Match" WHERE id=$1) AND "leftAt" IS NULL AND team IN ('RADIANT','DIRE')`,
            [context.matchId],
          );
          if (
            active.rows.length !== context.players.length ||
            active.rows.some(
              (p) =>
                !context.players.some(
                  (f) => f.userId === p.userId && f.teamSide === p.team,
                ),
            )
          )
            await fence.query(
              `UPDATE "DotaLaunchControl" SET status='REVOKED' WHERE "matchId"=$1`,
              [context.matchId],
            );
          else if (
            context.exclusiveOwner === true &&
            adapter.ready &&
            inspectTeams(context, adapter.observed).ok
          ) {
            await adapter.launch(request);
            await fence.query(
              `UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",'{LAUNCH_SUBMITTED}',to_jsonb(true)) WHERE "matchId"=$1 AND "launchRequestId"=$2`,
              [context.matchId, request],
            );
          }
        }
        await fence.query("COMMIT");
      } catch (e) {
        await fence.query("ROLLBACK");
        throw e;
      } finally {
        fence.release();
      }
    }
  }
}
export async function observeLaunch(pool, context, evidence) {
  if (
    evidence?.lobbyId !== context.lobbyId ||
    evidence.ownerSteamId !== context.worker.steamId ||
    evidence.gameMode !== context.gameMode ||
    evidence.serverRegion !== context.serverRegion ||
    (evidence.stateCode !== 2 &&
      !(
        process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY === "true" &&
        correlatedUnscoredPostgame(context, evidence)
      )) ||
    !/^\d{1,20}$/.test(evidence.matchId ?? "") ||
    evidence.matchId === "0"
  )
    return;
  await assertAuthorizedRoster(pool, context, "continue");
  await pool.query(
    `UPDATE "DotaLaunchControl" c SET status='STARTED',"externalMatchId"=$2,"startedObservedAt"=COALESCE("startedObservedAt",now()) FROM "DotaLobby" l,"Match" m WHERE c."matchId"=$1 AND c."lobbyId"=l.id AND m.id=c."matchId" AND l."workerId"=$3 AND l."lobbyId"=$4 AND (l.state='CONFIRMED' OR $5::boolean AND l.state='RECONCILING') AND m.status='QUEUED' AND c.status IN ('DISPATCHED','STARTED') AND (c."externalMatchId" IS NULL OR c."externalMatchId"=$2)`,
    [
      context.matchId,
      evidence.matchId,
      context.worker.id,
      context.lobbyId,
      process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY === "true" &&
        correlatedUnscoredPostgame(context, evidence),
    ],
  );
}
