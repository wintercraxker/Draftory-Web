import { terminalMatchCondition } from "./terminal-authority.mjs";
import { assertAttempt } from "./attempt-authorization.mjs";

export async function terminalCapability(db) {
  return !!(
    await db.query(`SELECT to_regclass('"DotaTerminalCleanup"')::text present`)
  ).rows[0]?.present;
}
// Web transaction only. A final trusted result and the existing GC/start link authorize this queue.
export async function enqueueTerminalCleanup(db, matchId) {
  await assertAttempt(db, matchId, "result");
  if (!(await terminalCapability(db))) return false;
  const result = await db.query(
    `INSERT INTO "DotaTerminalCleanup" ("lobbyId","matchId","workerId","correlationId","externalMatchId","verifiedAt")
 SELECT l.id,m.id,l."workerId",l."correlationId",x."dotaMatchId",COALESCE(m."verifiedAt" AT TIME ZONE 'UTC',(c."warningJournal"->'LIFECYCLE'->>'postgameAt')::timestamptz,(c."warningJournal"->'GC_DETAILS'->>'obtainedAt')::timestamptz) FROM "Match" m
 JOIN "DotaLobby" l ON l."matchId"=m.id JOIN "MatchExternalLink" x ON x."matchId"=m.id JOIN "DotaLaunchControl" c ON c."matchId"=m.id
 WHERE m.id=$1 AND ${terminalMatchCondition()}
 AND l.state IN ('CONFIRMED','RECONCILING') AND l."gcConfirmedAt" IS NOT NULL AND l."workerId" IS NOT NULL AND l."lobbyId"=x."lobbyId"
 AND x."workerId"=l."workerId" AND x."correlationId"=l."correlationId" AND c.status='STARTED' AND c."lobbyId"=l.id
 AND c."externalMatchId"=x."dotaMatchId" AND m."dotaMatchId"=x."dotaMatchId"
 ON CONFLICT ("lobbyId") DO NOTHING RETURNING "lobbyId"`,
    [matchId],
  );
  return result.rowCount > 0;
}
