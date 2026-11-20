// Shared connection policy. No URLs or credentials are included in diagnostics.
import { assertPublicConfiguration } from "./public-policy.mjs";
export function databaseTarget(
  value,
  { session = false } = {},
  env = process.env,
) {
  assertPublicConfiguration(env);
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error("DATABASE_TARGET_INVALID");
  }
  if (!["postgresql:", "postgres:"].includes(u.protocol))
    throw Error("DATABASE_TARGET_INVALID");
  const neon = env.DRAFTORY_DATABASE_BACKEND === "neon" || env.VERCEL === "1";
  if (neon) {
    const expected = env.DRAFTORY_DATABASE_HOST;
    const direct = (h) => h.replace(/-pooler(?=\.)/, "");
    if (
      !expected ||
      !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(expected) ||
      direct(u.hostname) !== expected ||
      u.pathname !== "/" + (env.DRAFTORY_DATABASE_NAME || "neondb") ||
      (u.port || "5432") !== "5432"
    )
      throw Error("DATABASE_TARGET_MISMATCH");
    if (session && u.hostname !== expected)
      throw Error("DATABASE_DIRECT_CONNECTION_REQUIRED");
    if (
      u.searchParams.getAll("sslmode").length !== 1 ||
      u.searchParams.get("sslmode") !== "verify-full" ||
      [...u.searchParams.keys()].some(
        (k) => !["sslmode", "schema", "channel_binding"].includes(k),
      ) ||
      (u.searchParams.has("schema") &&
        u.searchParams.get("schema") !== "public")
    )
      throw Error("DATABASE_TLS_VERIFICATION_REQUIRED");
    if (!env.DRAFTORY_EXPECTED_DATABASE_ID) throw Error("DATABASE_ID_REQUIRED");
    if (env.VERCEL === "1" && env.DRAFTORY_SHARED_RATE_LIMITS !== "true")
      throw Error("SHARED_RATE_LIMITS_REQUIRED");
    if (
      env.VERCEL_ENV === "preview" &&
      env.DRAFTORY_DEPLOYMENT_ENV !== "preview"
    )
      throw Error("PREVIEW_DATABASE_ISOLATION_REQUIRED");
    if (
      env.VERCEL === "1" &&
      (u.username !== "draftory_web" || !u.hostname.includes("-pooler."))
    )
      throw Error("RESTRICTED_POOLED_WEB_ROLE_REQUIRED");
  }
  return {
    neon,
    hostname: u.hostname,
    database: decodeURIComponent(u.pathname.slice(1)),
  };
}
export async function assertDatabaseIdentity(
  query,
  env = process.env,
  { write = false } = {},
) {
  const expected = env.DRAFTORY_EXPECTED_DATABASE_ID;
  if (!expected) {
    if (env.VERCEL === "1" || env.DRAFTORY_DATABASE_BACKEND === "neon")
      throw Error("DATABASE_ID_REQUIRED");
    return;
  }
  if (!/^[a-f0-9-]{36}$/i.test(expected)) throw Error("DATABASE_ID_INVALID");
  // JSON extraction keeps reads compatible before the additive window migration.
  // Preview writes fail closed when those columns are absent. PostgreSQL's clock,
  // not the application or guardian clock, decides whether the window is active.
  const result = await query(`SELECT "environmentId"::text,environment,
 CASE WHEN environment='preview' THEN "writesEnabled"
  AND COALESCE((to_jsonb(c)->>'writeWindowOpenedAt')::timestamptz<=clock_timestamp(),false)
  AND COALESCE((to_jsonb(c)->>'writeWindowExpiresAt')::timestamptz>clock_timestamp(),false)
  AND COALESCE((to_jsonb(c)->>'writeWindowExpiresAt')::timestamptz<=(to_jsonb(c)->>'writeWindowOpenedAt')::timestamptz+interval '15 minutes',false)
 ELSE "writesEnabled" END AS "writesEnabled"
 FROM "DeploymentControl" c WHERE singleton=true`);
  const row = Array.isArray(result) ? result[0] : result.rows?.[0];
  if (
    !row ||
    row.environmentId !== expected ||
    row.environment !== (env.DRAFTORY_DEPLOYMENT_ENV || "local")
  )
    throw Error("DATABASE_IDENTITY_MISMATCH");
  if (write && (!row.writesEnabled || env.DRAFTORY_MAINTENANCE === "true"))
    throw Error("DRAFTORY_MAINTENANCE");
}
