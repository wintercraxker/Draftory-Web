export type DotaCategory =
  | "PROFILE"
  | "WINLOSS"
  | "RECENT_MATCHES"
  | "HEROES"
  | "MATCH"
  | "PLAYER_STATS"
  | "POSITIONS"
  | "ANALYTICS";
export type ExternalStatus =
  "never_synced" | "available" | "stale" | "private" | "unavailable";
export type ExternalReason =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "NOT_CONFIGURED"
  | "NO_PUBLIC_DATA"
  | "INVALID_RESPONSE"
  | "TIMEOUT"
  | "ABORTED";
export type DotaRank = {
  tier: number;
  name: string;
  image: string;
  stars: number | null;
};
export type DotaProfileData = {
  accountId: string;
  rank: DotaRank | null;
  leaderboardRank: number | null;
};
export type DotaWinLoss = {
  wins: number;
  losses: number;
  games: number;
  winrate: number | null;
};
export type DotaExternalMatch = {
  matchId: string;
  startedAt: string | null;
  durationSeconds: number | null;
  gameMode: number | null;
  lobbyType: number | null;
  radiantWon: boolean | null;
  playerSlot: number | null;
  heroId: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  goldPerMinute: number | null;
  experiencePerMinute: number | null;
};
export type DotaHero = {
  heroId: number;
  games: number;
  wins: number;
  losses?: number;
  lastPlayed?: string | null;
  winrate: number | null;
};
export type DotaMatchDetail = {
  matchId: string;
  startedAt: string | null;
  durationSeconds: number | null;
  gameMode: number | null;
  lobbyType: number | null;
  radiantWon: boolean | null;
  players: {
    accountId: string | null;
    playerSlot: number | null;
    heroId: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    goldPerMinute: number | null;
    experiencePerMinute: number | null;
  }[];
};
export type DotaData =
  | DotaProfileData
  | DotaWinLoss
  | DotaExternalMatch[]
  | DotaHero[]
  | DotaMatchDetail
  | DotaPlayerStats
  | DotaPosition[]
  | StratzAnalytics;
export type StratzAnalytics = {
  imp: number | null;
  isStratzPublic: boolean;
  isAnonymous: boolean;
  roles: {
    role: string;
    games: number;
    wins: number;
    winrate: number | null;
    lanes: { lane: number; games: number; wins: number }[];
  }[];
};
export type NormalizedResult = {
  data: DotaData;
  coverage: { scope: string; sampleSize: number | null };
  empty: boolean;
};
export type DotaStatsDto = {
  provider: DotaProviderName;
  category: DotaCategory;
  status: ExternalStatus;
  errorReason: ExternalReason | null;
  fetchedAt: string | null;
  expiresAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  syncing: boolean;
  coverage: NormalizedResult["coverage"] | null;
  data: DotaData | null;
};

export type DotaProviderName = "OPENDOTA" | "STRATZ";
export type DotaPlayerStats = {
  kda: number | null;
  goldPerMinute: number | null;
  experiencePerMinute: number | null;
  samples: { kda: number; goldPerMinute: number; experiencePerMinute: number };
};
export type DotaPosition = {
  position: number;
  games: number;
  wins: number;
  winrate: number | null;
};
export type HeroCatalogEntry = { heroId: number; name: string; image: string };
export type ManualSyncStatus = {
  interrupted?: boolean;
  initialPending?: boolean;
  lastSuccessfulSyncAt?: string | null;
  nextSyncAt?: string | null;
  syncing: boolean;
  available: boolean;
  label: string;
  outcome: "SUCCESS" | "PARTIAL_SUCCESS" | "TOTAL_FAILURE" | null;
};
export type DotaProfileBundle = {
  availability?: import("./availability").PublicAvailability;
  privacyEvidence?:
    "STEAM_PROFILE_NOT_PUBLIC" | "STRATZ_PROFILE_NOT_PUBLIC" | null;
  analytics?: DotaStatsDto;
  profile: DotaStatsDto;
  winloss: DotaStatsDto;
  heroes: DotaStatsDto;
  performance: DotaStatsDto;
  positions: DotaStatsDto;
  catalog: HeroCatalogEntry[];
  manualSync: ManualSyncStatus;
};
