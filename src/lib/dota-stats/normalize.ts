import type {
  DotaCategory,
  DotaExternalMatch,
  DotaRank,
  NormalizedResult,
} from "./types";
export class InvalidDotaResponse extends Error {
  constructor() {
    super("INVALID_RESPONSE");
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvalidDotaResponse();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
function requiredInt(value: unknown) {
  const result = integer(value);
  if (result === null) throw new InvalidDotaResponse();
  return result;
}
function id(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return String(value);
  if (typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)) return value;
  throw new InvalidDotaResponse();
}
function timestamp(value: unknown) {
  const seconds = integer(value);
  if (seconds === null || seconds === 0 || seconds > 253402300799) return null;
  return new Date(seconds * 1000).toISOString();
}
export function normalizeRank(tier: unknown): DotaRank | null {
  const value = integer(tier);
  if (value === null) return null;
  if (value === 80)
    return {
      tier: value,
      name: "Inmortal",
      image: "/m_inmortal.webp",
      stars: null,
    };
  const level = Math.floor(value / 10),
    stars = value % 10;
  const ranks = [
    ["Heraldo", "/m_heraldo.webp"],
    ["Guardián", "/m_guardian.webp"],
    ["Cruzado", "/m_cruzado.webp"],
    ["Arconte", "/m_arconte.webp"],
    ["Leyenda", "/m_leyenda.webp"],
    ["Ancient", "/m_ancient.webp"],
    ["Divine", "/m_divine.webp"],
  ];
  if (level < 1 || level > 7 || stars < 1 || stars > 5) return null;
  return {
    tier: value,
    name: ranks[level - 1][0],
    image: ranks[level - 1][1],
    stars,
  };
}
function performance(p: Record<string, unknown>) {
  return {
    playerSlot: integer(p.player_slot),
    heroId: integer(p.hero_id),
    kills: integer(p.kills),
    deaths: integer(p.deaths),
    assists: integer(p.assists),
    goldPerMinute: integer(p.gold_per_min),
    experiencePerMinute: integer(p.xp_per_min),
  };
}
function match(p: Record<string, unknown>): DotaExternalMatch {
  return {
    matchId: id(p.match_id),
    startedAt: timestamp(p.start_time),
    durationSeconds: integer(p.duration),
    gameMode: integer(p.game_mode),
    lobbyType: integer(p.lobby_type),
    radiantWon: typeof p.radiant_win === "boolean" ? p.radiant_win : null,
    ...performance(p),
  };
}
export function normalizeDota(
  category: DotaCategory,
  raw: unknown,
  accountId: string,
  matchId?: string,
): NormalizedResult {
  if (category === "PROFILE") {
    const p = object(raw);
    if (!("profile" in p)) throw new InvalidDotaResponse();
    if (p.profile !== null) {
      const profile = object(p.profile);
      if (id(profile.account_id) !== accountId) throw new InvalidDotaResponse();
    }
    const rank = normalizeRank(p.rank_tier),
      leaderboardRank = integer(p.leaderboard_rank);
    return {
      data: {
        accountId,
        rank,
        leaderboardRank:
          leaderboardRank && leaderboardRank > 0 ? leaderboardRank : null,
      },
      coverage: { scope: "published_profile", sampleSize: null },
      empty: p.profile === null && rank === null && !leaderboardRank,
    };
  }
  if (category === "WINLOSS") {
    const p = object(raw),
      wins = requiredInt(p.win),
      losses = requiredInt(p.lose),
      games = wins + losses;
    if (!Number.isSafeInteger(games)) throw new InvalidDotaResponse();
    return {
      data: {
        wins,
        losses,
        games,
        winrate: games ? (wins / games) * 100 : null,
      },
      coverage: {
        scope: "provider_indexed_default_filters",
        sampleSize: games,
      },
      empty: games === 0,
    };
  }
  if (category === "RECENT_MATCHES" || category === "HEROES") {
    if (!Array.isArray(raw) || raw.length > (category === "HEROES" ? 300 : 100))
      throw new InvalidDotaResponse();
    const data =
      category === "RECENT_MATCHES"
        ? raw.map((p) => match(object(p)))
        : raw
            .map((value) => {
              const p = object(value),
                heroId = requiredInt(p.hero_id),
                games = requiredInt(p.games),
                wins = requiredInt(p.win);
              if (!heroId || wins > games) throw new InvalidDotaResponse();
              return {
                heroId,
                games,
                wins,
                losses: games - wins,
                lastPlayed: timestamp(p.last_played),
                winrate: games ? (wins / games) * 100 : null,
              };
            })
            .filter((p) => p.games > 0)
            .sort((a, b) => b.games - a.games);
    return {
      data,
      coverage: {
        scope:
          category === "RECENT_MATCHES"
            ? "latest_provider_matches_max_20"
            : "provider_indexed_default_filters",
        sampleSize: category === "RECENT_MATCHES" ? data.length : null,
      },
      empty: data.length === 0,
    };
  }
  if (category === "PLAYER_STATS") {
    if (!Array.isArray(raw) || raw.length > 100)
      throw new InvalidDotaResponse();
    const result = (field: string) => {
      const rows = raw.filter((v) => object(v).field === field);
      if (rows.length > 1) throw new InvalidDotaResponse();
      const p = rows.length ? object(rows[0]) : {};
      const n = integer(p.n) ?? 0;
      const sum =
        typeof p.sum === "number" && Number.isFinite(p.sum) && p.sum >= 0
          ? p.sum
          : null;
      if (n > 0 && sum === null) throw new InvalidDotaResponse();
      return { value: n && sum !== null ? sum / n : null, n };
    };
    const k = result("kda"),
      g = result("gold_per_min"),
      x = result("xp_per_min");
    return {
      data: {
        kda: k.value,
        goldPerMinute: g.value,
        experiencePerMinute: x.value,
        samples: { kda: k.n, goldPerMinute: g.n, experiencePerMinute: x.n },
      },
      coverage: {
        scope: "provider_indexed_totals_kda_mean_(K+A)/(D+1)",
        sampleSize: null,
      },
      empty: !k.n && !g.n && !x.n,
    };
  }
  void matchId; // Legacy MATCH input is rejected; analytics belong to STRATZ.
  throw new InvalidDotaResponse();
}
