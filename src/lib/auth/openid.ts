import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { authConfig } from "./config";

const ns = "http://specs.openid.net/auth/2.0";
const identifier = "http://specs.openid.net/auth/2.0/identifier_select";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function validToken(token: string | undefined | null): token is string {
  return !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
}
export function sameToken(a: string, b: string) {
  return (
    validToken(a) &&
    validToken(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}

export function steamAccountId(steamId: string) {
  if (!/^\d{17}$/.test(steamId)) throw new Error("INVALID_STEAM_ID");
  const account = BigInt(steamId) - BigInt("76561197960265728");
  if (account <= BigInt(0) || account > BigInt("4294967295"))
    throw new Error("INVALID_STEAM_ID");
  return account.toString();
}

export function callbackUrl(origin: string, state: string) {
  const url = new URL(authConfig.callbackPath, origin);
  url.searchParams.set("state", state);
  return url.href;
}
export function steamLoginUrl(origin: string, state: string) {
  const url = new URL(authConfig.steamOpenId);
  for (const [key, value] of Object.entries({
    ns,
    mode: "checkid_setup",
    return_to: callbackUrl(origin, state),
    realm: `${origin}/`,
    identity: identifier,
    claimed_id: identifier,
  }))
    url.searchParams.set(`openid.${key}`, value);
  return url.href;
}

// Direct verification with the fixed Steam provider; never trust op_endpoint as
// a destination. Required fields must be signed and the browser-bound return_to exact.
export async function verifySteamAssertion(
  params: URLSearchParams,
  origin: string,
  state: string,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
) {
  for (const key of new Set(params.keys()))
    if (params.getAll(key).length !== 1) throw new Error("INVALID_ASSERTION");
  const get = (key: string) => params.get(`openid.${key}`);
  if (
    get("ns") !== ns ||
    get("mode") !== "id_res" ||
    get("op_endpoint") !== authConfig.steamOpenId ||
    get("return_to") !== callbackUrl(origin, state)
  )
    throw new Error("INVALID_ASSERTION");
  const signed = new Set((get("signed") ?? "").split(","));
  if (
    ![
      "op_endpoint",
      "return_to",
      "response_nonce",
      "claimed_id",
      "identity",
    ].every((key) => signed.has(key)) ||
    !get("sig")
  )
    throw new Error("INVALID_ASSERTION");
  const identity = get("claimed_id") ?? "";
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(
    identity,
  );
  if (!match || get("identity") !== identity)
    throw new Error("INVALID_STEAM_ID");
  steamAccountId(match[1]);
  const nonce = get("response_nonce") ?? "";
  const time = Date.parse(nonce.slice(0, 20));
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.+$/.test(nonce) ||
    !Number.isFinite(time) ||
    Math.abs(now - time) > authConfig.stateSeconds * 1000
  )
    throw new Error("EXPIRED_ASSERTION");
  const body = new URLSearchParams();
  params.forEach((value, key) => {
    if (key.startsWith("openid.")) body.set(key, value);
  });
  body.set("openid.mode", "check_authentication");
  const response = await fetcher(authConfig.steamOpenId, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    cache: "no-store",
  });
  if (
    !response.ok ||
    !(await response.text()).split(/\r?\n/).includes("is_valid:true")
  )
    throw new Error("INVALID_ASSERTION");
  return { steamId: match[1], nonce };
}
