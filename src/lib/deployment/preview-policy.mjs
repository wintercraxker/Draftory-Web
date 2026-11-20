// Preview-only safety; never an authentication or Deployment Protection bypass.
export function fixturePreview(env = process.env) {
  return (
    env.VERCEL_ENV === "preview" &&
    env.DRAFTORY_DEPLOYMENT_ENV === "preview" &&
    env.DRAFTORY_PREVIEW_FIXTURES_ONLY === "true"
  );
}
export function previewOrigin(env = process.env) {
  if (
    env.VERCEL_ENV === "preview" &&
    env.DRAFTORY_DEPLOYMENT_ENV === "preview" &&
    /^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL || "")
  )
    return "https://" + env.VERCEL_URL;
  return null;
}
// A private, exact one-account allowlist. Never derive access from a username,
// request body, client flag, or the synthetic-ID prefix of a Steam account.
function trialSteamId(env) {
  try {
    const ids = JSON.parse(env.DRAFTORY_PREVIEW_STEAM_ALLOWED_IDS || "null");
    if (
      !Array.isArray(ids) ||
      ids.length !== 1 ||
      typeof ids[0] !== "string" ||
      !/^\d{17}$/.test(ids[0])
    )
      return null;
    const account = BigInt(ids[0]) - 76561197960265728n;
    return account > 0n && account <= 4294967295n ? ids[0] : null;
  } catch {
    return null;
  }
}
export function previewSteamEnabled(env = process.env) {
  const origin = previewOrigin(env);
  return (
    fixturePreview(env) &&
    env.DRAFTORY_PREVIEW_STEAM_OPENID === "true" &&
    !!trialSteamId(env) &&
    !!origin &&
    (!env.APP_URL || env.APP_URL === origin)
  );
}
export function permittedSteamIdentity(steamId, env = process.env) {
  return (
    env.VERCEL_ENV !== "preview" ||
    (previewSteamEnabled(env) && steamId === trialSteamId(env))
  );
}
export function permittedPreviewUser(id, env = process.env, steamId) {
  if (env.VERCEL_ENV !== "preview") return true;
  if (!fixturePreview(env)) return false;
  return steamId
    ? permittedSteamIdentity(steamId, env)
    : id.startsWith("preview-fixture-");
}
export function blockedPreviewPath(path, method, env = process.env) {
  if (env.VERCEL_ENV === "preview" && /^\/api\/auth\/steam(?:\/|$)/.test(path))
    return !previewSteamEnabled(env);
  return (
    env.VERCEL_ENV === "preview" &&
    (path === "/api/internal/maintenance" ||
      /^\/api\/dota-stats(?:\/|$)/.test(path) ||
      path === "/api/predictions/sync" ||
      /^\/api\/rooms\/[^/]+\/lobby-access$/.test(path) ||
      (method !== "GET" && /^\/api\/matches(?:\/|$)/.test(path)))
  );
}
export function blockedPreviewAction(action, env = process.env) {
  return (
    env.VERCEL_ENV === "preview" &&
    ["prepare", "start", "confirmReady"].includes(action)
  );
}
