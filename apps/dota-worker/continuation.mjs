export async function continuationAvailable(db, env = process.env) {
  if (env.DRAFTORY_ENABLE_BOT_CONTINUATION !== "true") return false;
  return (
    (
      await db.query(
        `SELECT to_regclass(current_schema()||'."DotaRoomContinuation"') IS NOT NULL ready`,
      )
    ).rows[0]?.ready === true
  );
}
export async function continuationClaimFilter(db) {
  if (!(await continuationAvailable(db))) return "";
  await db.query("SELECT draftory_continuation_tick()");
  return `AND (j.kind<>'CREATE_LOBBY' OR NOT EXISTS(SELECT 1 FROM "DotaRoomContinuation" c WHERE c."nextMatchId"=m.id AND (c."workerId"<>$1 OR c.state NOT IN ('BOUND','CONSUMED') OR c."expiresAt"<=clock_timestamp() AND j."dispatchedAt" IS NULL)))
 AND (j.kind<>'CREATE_LOBBY' OR NOT EXISTS(SELECT 1 FROM "DotaRoomContinuation" c WHERE c."workerId"=$1 AND c.state IN ('WAITING_CLEANUP','RESERVED','BOUND') AND (c."expiresAt" IS NULL OR c."expiresAt">clock_timestamp()) AND COALESCE(c."nextMatchId",'')<>m.id))`;
}
export async function consumeContinuation(db, matchId) {
  if (await continuationAvailable(db))
    await db.query("SELECT draftory_consume_continuation($1)", [matchId]);
}
