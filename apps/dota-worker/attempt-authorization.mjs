import { rosterHash } from "./launch-policy.mjs";
import { roomFormat } from "../../src/lib/rooms/lobby-options.mjs";

export const platformAuthorizationEnabled = (env = process.env) =>
  env.DRAFTORY_DOTA_PLATFORM_AUTOMATION === "true" &&
  !env.DRAFTORY_DOTA_TEST_MATCH_ID &&
  env.DRAFTORY_DOTA_SINGLE_ATTEMPT_ONLY !== "true";

export function competitiveAdmissionOpen(env = process.env, at = Date.now()) {
  if (
    env.DRAFTORY_DOTA_PLATFORM_AUTOMATION !== "true" ||
    env.DRAFTORY_ENABLE_DOTA_AUTO_LAUNCH !== "true"
  )
    return false;
  if (env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE !== "true") return true;
  const deadline = Date.parse(env.DRAFTORY_DOTA_APPROVAL_EXPIRES_AT ?? "");
  return (
    env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS" &&
    !env.DRAFTORY_DOTA_ALLOWED_ROOM_IDS &&
    Number.isFinite(deadline) &&
    deadline > at
  );
}

// Called only by the web's PASSED/full ReadyCheck transaction, never by a worker.
export async function authorizeReadyAttempt(db, matchId, env = process.env) {
  if (!platformAuthorizationEnabled(env)) return false;
  if (
    env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
    !competitiveAdmissionOpen(env)
  )
    throw Error("COMPETITIVE_ADMISSION_CLOSED");
  const platform = (
    await db.query(
      `SELECT to_regclass('"DotaAttemptAuthorization_live"')::text AS present`,
    )
  ).rows[0];
  if (!platform?.present)
    throw Error("PLATFORM_AUTHORIZATION_MIGRATION_REQUIRED");
  const m = (
    await db.query(
      `SELECT m.*,r.phase FROM "Match" m JOIN "Room" r ON r.id=m."roomId" WHERE m.id=$1 FOR UPDATE OF r,m`,
      [matchId],
    )
  ).rows[0];
  if (!m || m.status !== "QUEUED" || m.phase !== "PREPARING")
    throw Error("ATTEMPT_NOT_ELIGIBLE");
  const format = roomFormat(m.mode);
  if (
    env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
    env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS" &&
    !(env.DRAFTORY_DOTA_AUTO_LAUNCH_MODES ?? "").split(",").includes(m.mode)
  )
    throw Error("PUBLIC_MODE_NOT_APPROVED");
  const ready = (
    await db.query(
      `SELECT rc.status,count(rp."userId")::int AS total,count(rp."confirmedAt")::int AS confirmed FROM "ReadyCheck" rc JOIN "ReadyCheckPlayer" rp ON rp."readyCheckId"=rc.id WHERE rc."matchId"=$1 GROUP BY rc.id`,
      [matchId],
    )
  ).rows[0];
  if (
    ready?.status !== "PASSED" ||
    ready.total !== format.players ||
    ready.confirmed !== format.players
  )
    throw Error("READY_REQUIRED");
  const players = (
    await db.query(
      `SELECT p."userId",u."steamId",p."teamSide",p.slot FROM "MatchPlayer" p JOIN "User" u ON u.id=p."userId" WHERE p."matchId"=$1`,
      [matchId],
    )
  ).rows;
  const hash = rosterHash(players, m.mode, m.region);
  // The Match row lock serializes producers. Avoid BEFORE INSERT audit on an
  // ON CONFLICT no-op: a replay must not manufacture another AUTHORIZED event.
  if (
    !(
      await db.query(
        `SELECT "matchId" FROM "DotaAttemptAuthorization" WHERE "matchId"=$1`,
        [matchId],
      )
    ).rowCount
  )
    await db.query(
      `WITH authorization_clock AS MATERIALIZED (SELECT clock_timestamp() AS at) INSERT INTO "DotaAttemptAuthorization" ("matchId","roomId",mode,"attemptCreatedAt","rosterHash",roster,operator,reason,"createdAt","expiresAt") SELECT $1,$2,$3,$4,$5,$6,'backend:ready-check','All persisted participants confirmed the frozen roster',at,LEAST(at+interval '24 hours',COALESCE($7::timestamptz,at+interval '24 hours')) FROM authorization_clock WHERE $7::timestamptz IS NULL OR at<$7::timestamptz`,
      [
        matchId,
        m.roomId,
        m.mode,
        m.createdAt,
        hash,
        JSON.stringify(players),
        env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true"
          ? env.DRAFTORY_DOTA_APPROVAL_EXPIRES_AT
          : null,
      ],
    );
  await assertAuthorizedRoster(
    db,
    { matchId, mode: m.mode, region: m.region, players },
    "start",
    env,
  );
  return true;
}

// Public PostgreSQL always fails closed. Existing isolated regression schemas
// retain their fixture behavior; dedicated scope tests explicitly opt in.
export async function scopeRequired(db, env = process.env) {
  if (
    env.DRAFTORY_DOTA_SINGLE_ATTEMPT_ONLY === "true" ||
    platformAuthorizationEnabled(env)
  )
    return true;
  return (
    (await db.query("SELECT current_schema() AS scope_schema")).rows[0]
      ?.scope_schema === "public"
  );
}
export async function scopeFilter(
  db,
  match = "m",
  phase = "start",
  env = process.env,
) {
  if (!(await scopeRequired(db, env))) return "TRUE";
  if (
    !(
      await db.query(
        `SELECT to_regclass('"DotaAttemptAuthorization"')::text AS present`,
      )
    ).rows[0]?.present
  )
    throw Error("ATTEMPT_AUTHORIZATION_MIGRATION_REQUIRED");
  if (!/^[a-z]+$/.test(match)) throw Error("INVALID_SCOPE_ALIAS");
  const fresh = `a."revokedAt" IS NULL AND a."expiresAt">clock_timestamp()`;
  const lifecycle =
    phase === "result"
      ? `a."consumedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "DotaLaunchControl" sc WHERE sc."matchId"=${match}.id AND sc.status='STARTED' AND sc."startedObservedAt" IS NOT NULL)`
      : phase === "continue"
        ? `a."consumedAt" IS NOT NULL`
        : phase === "operate"
          ? `a."consumedAt" IS NOT NULL AND ${fresh}`
          : fresh;
  const rooms = env.DRAFTORY_DOTA_ALLOWED_ROOM_IDS
    ? env.DRAFTORY_DOTA_ALLOWED_ROOM_IDS.split(",")
    : undefined;
  if (env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS" && rooms)
    throw Error("INVALID_ROOM_SCOPE");
  if (
    rooms &&
    (!rooms.length || rooms.some((id) => !/^[A-Za-z0-9_-]{1,100}$/.test(id)))
  )
    throw Error("INVALID_ROOM_SCOPE");
  const deadline = env.DRAFTORY_DOTA_APPROVAL_EXPIRES_AT;
  if (deadline && !Number.isFinite(Date.parse(deadline)))
    throw Error("INVALID_APPROVAL_DEADLINE");
  const roomFilter = ["start", "operate"].includes(phase)
    ? (rooms
        ? ' AND a."roomId" IN (' +
          rooms.map((id) => "'" + id + "'").join(",") +
          ")"
        : "") +
      (deadline
        ? " AND clock_timestamp()<'" +
          new Date(deadline).toISOString() +
          "'::timestamptz"
        : "")
    : "";
  const configured = env.DRAFTORY_DOTA_TEST_MATCH_ID;
  if (configured && !/^[a-zA-Z0-9_-]{1,100}$/.test(configured))
    throw Error("INVALID_AUTHORIZED_ATTEMPT");
  const modes = platformAuthorizationEnabled(env)
    ? env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
      env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS"
      ? `a.mode IN ('ALL_PICK','CAPTAINS_MODE','TURBO'${(env.DRAFTORY_DOTA_AUTO_LAUNCH_MODES ?? "").split(",").includes("ONE_V_ONE_MID") ? ",'ONE_V_ONE_MID'" : ""})`
      : `a.mode IN ('ONE_V_ONE_MID','ALL_PICK','CAPTAINS_MODE','TURBO')`
    : `a.mode='ONE_V_ONE_MID'`;
  return `EXISTS(SELECT 1 FROM "DotaAttemptAuthorization" a WHERE a."matchId"=${match}.id AND a."roomId"=${match}."roomId" AND a.mode=${match}.mode AND ${modes} AND a."attemptCreatedAt"=${match}."createdAt" AND ${lifecycle}${roomFilter}${configured ? ` AND a."matchId"='${configured}'` : ""})`;
}
export async function assertAttempt(
  db,
  matchId,
  phase = "start",
  env = process.env,
) {
  if (!(await scopeRequired(db, env))) return;
  const filter = await scopeFilter(db, "m", phase, env);
  await db.query(
    "SELECT pg_advisory_xact_lock_shared(hashtext('draftory-attempt:'||$1))::text AS scope_lock",
    [matchId],
  );
  if (
    !(
      await db.query(`SELECT m.id FROM "Match" m WHERE m.id=$1 AND ${filter}`, [
        matchId,
      ])
    ).rowCount
  )
    throw Error("ATTEMPT_NOT_AUTHORIZED");
}
export async function assertAuthorizedRoster(
  db,
  context,
  phase = "start",
  env = process.env,
) {
  if (!(await scopeRequired(db, env))) return;
  await assertAttempt(db, context.matchId, phase, env);
  const a = (
    await db.query(
      `SELECT "rosterHash" FROM "DotaAttemptAuthorization" WHERE "matchId"=$1`,
      [context.matchId],
    )
  ).rows[0];
  if (
    !a ||
    a.rosterHash !== rosterHash(context.players, context.mode, context.region)
  )
    throw Error("AUTHORIZED_ROSTER_CHANGED");
}
export async function consumeAuthorization(db, matchId, env = process.env) {
  if (!(await scopeRequired(db, env))) return;
  // Called in enqueueCreate's ReadyCheck transaction. The same attempt may
  // resume its existing lobby; PK/queue idempotency never admits a second one.
  const r = await db.query(
    `UPDATE "DotaAttemptAuthorization" SET "consumedAt"=COALESCE("consumedAt",clock_timestamp()) WHERE "matchId"=$1 AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() RETURNING "matchId"`,
    [matchId],
  );
  if (!r.rowCount) throw Error("ATTEMPT_NOT_AUTHORIZED");
}
