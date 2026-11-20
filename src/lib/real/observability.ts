import { recordProviderCache } from "../dota-stats/telemetry";
// Explicit allowlist. Never accepts provider raw errors, bodies or credentials.
export function productLog(
  event:
    | "provider"
    | "cache"
    | "match-link"
    | "analytics"
    | "sanction"
    | "room-join",
  data: {
    requestId?: string;
    provider?: string;
    status?: string;
    cache?: "hit" | "miss";
    reason?: string;
  },
) {
  if (event === "cache" && data.cache)
    recordProviderCache(
      data.provider ?? (data.status === "MATCH" ? "MATCH" : "INTERNAL"),
      data.cache === "hit",
    );
  const keys = ["requestId", "provider", "status", "cache", "reason"];
  console.info(
    JSON.stringify({
      event,
      ...Object.fromEntries(
        Object.entries(data)
          .filter(([k, v]) => keys.includes(k) && typeof v === "string")
          .map(([k, v]) => [k, v!.slice(0, 100)]),
      ),
    }),
  );
}
