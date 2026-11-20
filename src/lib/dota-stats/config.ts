export const dotaStatsConfig = {
  provider: "OPENDOTA" as const,
  timeoutMs: 8000,
  maxResponseBytes: 512 * 1024,
  leaseMs: 30_000,
  cooldownMs: 5 * 60_000,
  ttl: {
    PROFILE: 6 * 3600_000,
    WINLOSS: 3600_000,
    RECENT_MATCHES: 15 * 60_000,
    HEROES: 3600_000,
    MATCH: 24 * 3600_000,
    PLAYER_STATS: 24 * 3600_000,
    POSITIONS: 24 * 3600_000,
    ANALYTICS: 24 * 3600_000,
  },
  heroCatalogTtlMs: 24 * 3600_000,
  negativeTtlMs: 3600_000,
  incompleteMatchTtlMs: 15 * 60_000,
  perMinute: 45,
  perDay: 2400, // Application ceiling; provider quotas depend on its current access policy.
};
export function dotaStatsEnabled() {
  return process.env.DRAFTORY_ENABLE_DOTA_STATS === "true";
}
