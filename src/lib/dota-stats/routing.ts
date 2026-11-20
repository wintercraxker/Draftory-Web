// Only verified contracts are eligible. A token is not proof of schema access.
export const providerPlan = {
  PROFILE: { primary: "OPENDOTA", active: true },
  RANK: { primary: "OPENDOTA", sharedWith: "PROFILE", active: true },
  LEADERBOARD: { primary: "OPENDOTA", sharedWith: "PROFILE", active: true },
  WINLOSS: { primary: "OPENDOTA", active: true },
  PLAYER_STATS: { primary: "OPENDOTA", active: true },
  HEROES: { primary: "OPENDOTA", active: true },
  HERO_STATS: { primary: "OPENDOTA", sharedWith: "HEROES", active: true },
  POSITIONS: { primary: "STRATZ", active: false },
  ROLE_STATS: { primary: "STRATZ", sharedWith: "POSITIONS", active: false },
  CATALOG: { primary: "OPENDOTA", active: true },
  BENCHMARKS: { primary: "OPENDOTA", active: false },
  MATCH_DETAILS: {
    primary: "STRATZ",
    active: true,
    requiresVerifiedGcLink: true,
  },
  MATCH_TIMELINE: {
    primary: "STRATZ",
    active: false,
    requiresVerifiedGcLink: true,
  },
  ANALYTICS: {
    primary: "STRATZ",
    active: true,
    requiresFlag: "DRAFTORY_ENABLE_STRATZ",
  },
} as const;
