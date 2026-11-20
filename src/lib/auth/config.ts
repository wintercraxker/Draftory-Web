import { previewOrigin } from "../deployment/preview-policy.mjs";
export const authConfig = {
  sessionCookie: "draftory_session",
  stateCookie: "draftory_steam_state",
  sessionSeconds: 60 * 60 * 24 * 30,
  stateSeconds: 60 * 10,
  steamOpenId: "https://steamcommunity.com/openid/login",
  callbackPath: "/api/auth/steam/callback",
};

export function appOrigin() {
  const configured = process.env.APP_URL || previewOrigin();
  if (!configured) throw new Error("AUTH_NOT_CONFIGURED");
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    process.env.VERCEL_ENV === "preview" &&
    (!previewOrigin() || url.origin !== previewOrigin())
  )
    throw new Error("PREVIEW_AUTH_ISOLATION_REQUIRED");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  )
    throw new Error("AUTH_NOT_CONFIGURED");
  return url.origin;
}

export function demoEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DRAFTORY_ENABLE_DEMO === "true"
  );
}

export function missingAuthConfiguration() {
  const missing = ["APP_URL", "DATABASE_URL"].filter(
    (key) =>
      !process.env[key]?.trim() && !(key === "APP_URL" && previewOrigin()),
  );
  if (!missing.includes("APP_URL")) {
    try {
      appOrigin();
    } catch {
      missing.push("APP_URL (origen HTTPS o localhost válido)");
    }
  }
  return missing;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith("https:"),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function requireSameOrigin(request: Request) {
  if (
    request.headers.get("origin") !== appOrigin() ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("FORBIDDEN_ORIGIN");
}
