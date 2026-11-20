// Internal, bounded process counters. No URLs, account IDs, tokens or payloads.
export type ExternalCounter = {
  requests: number;
  active: number;
  errors: number;
  rateLimited: number;
  timeouts: number;
  totalMs: number;
  maxMs: number;
  cacheHits: number;
  cacheMisses: number;
};
const counters = new Map<string, ExternalCounter>();
function bucket(label: string) {
  let c = counters.get(label);
  if (!c) {
    c = {
      requests: 0,
      active: 0,
      errors: 0,
      rateLimited: 0,
      timeouts: 0,
      totalMs: 0,
      maxMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    counters.set(label, c);
  }
  return c;
}
function endpoint(raw: string | URL) {
  try {
    const u = new URL(raw);
    if (u.hostname === "api.stratz.com") return "STRATZ:graphql";
    if (u.hostname === "steamcommunity.com") return "STEAM:openid";
    if (u.hostname === "api.steampowered.com")
      return u.pathname.includes("GetPlayerSummaries")
        ? "STEAM:profile"
        : "VALVE:match";
    if (u.hostname === "api.opendota.com") {
      if (u.pathname.includes("/constants/")) return "OPENDOTA:catalog";
      if (u.pathname.includes("/matches/")) return "OPENDOTA:match";
      const suffix = u.pathname.split("/").at(-1);
      return (
        "OPENDOTA:" +
        (["wl", "recentMatches", "heroes", "totals"].includes(suffix ?? "")
          ? suffix
          : "profile")
      );
    }
  } catch {}
  return "OTHER:request";
}
export function beginExternalRequest(url: string | URL) {
  const c = bucket(endpoint(url)),
    started = performance.now();
  let ended = false;
  c.requests++;
  c.active++;
  return {
    status(status: number) {
      if (status === 429) c.rateLimited++;
    },
    failure(reason: string) {
      c.errors++;
      if (reason === "TIMEOUT") c.timeouts++;
    },
    end() {
      if (ended) return;
      ended = true;
      c.active--;
      const ms = performance.now() - started;
      c.totalMs += ms;
      c.maxMs = Math.max(c.maxMs, ms);
    },
  };
}
export function recordProviderCache(provider: string, hit: boolean) {
  if (
    ![
      "OPENDOTA",
      "STRATZ",
      "VALVE",
      "GC",
      "STEAM",
      "INTERNAL",
      "MATCH",
    ].includes(provider)
  )
    return;
  const c = bucket(provider + ":cache");
  if (hit) c.cacheHits++;
  else c.cacheMisses++;
}
export function externalMetricsSnapshot() {
  return Object.fromEntries([...counters].map(([k, v]) => [k, { ...v }]));
}
