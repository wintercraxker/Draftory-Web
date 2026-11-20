// Public production must never inherit the private trial's database or access
// policy. This validates configuration, never user identity or Staff privileges.
export function assertPublicConfiguration(env = process.env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production") return;
  if (env.DRAFTORY_DEPLOYMENT_ENV !== "production")
    throw Error("PUBLIC_DATABASE_ENVIRONMENT_REQUIRED");
  if (
    env.DRAFTORY_PREVIEW_FIXTURES_ONLY === "true" ||
    env.DRAFTORY_PREVIEW_STEAM_OPENID === "true" ||
    env.DRAFTORY_PREVIEW_STEAM_ALLOWED_IDS?.trim()
  )
    throw Error("PRIVATE_TRIAL_CONFIGURATION_IN_PUBLIC");
  if (
    env.DRAFTORY_EXPECTED_DATABASE_ID === "00000000-0000-4000-8000-000000000004"
  )
    throw Error("STAGING_DATABASE_IN_PUBLIC");
  if (
    env.DRAFTORY_ENABLE_DEMO === "true" ||
    env.DRAFTORY_ENABLE_MULTIPLAYER_TEST === "true" ||
    env.DRAFTORY_ENABLE_MATCH_PREVIEW === "true"
  )
    throw Error("FIXTURE_CONFIGURATION_IN_PUBLIC");
  let origin;
  try {
    origin = new URL(env.APP_URL);
  } catch {
    throw Error("PUBLIC_ORIGIN_REQUIRED");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !/^[a-z0-9.-]+$/i.test(origin.hostname) ||
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
    throw Error("PUBLIC_HTTPS_ORIGIN_REQUIRED");
}
