import { competitiveConfig as config, medals } from "./config";
import type { DotaRoleId } from "../dota-roles";
import { normalizeRank } from "../dota-stats/normalize";

export type CompetitiveStats = {
  mmr: number;
  elo: number;
  xp: number;
  level: number;
  leaderboardRank?: number;
};
export type Player = CompetitiveStats & {
  id: string;
  name: string;
  avatar?: string;
  dotaRankTier?: number | null;
  dotaRankStale?: boolean;
  preferredRolePrimary?: DotaRoleId | null;
  preferredRoleSecondary?: DotaRoleId | null;
  mmrAvailable?: boolean;
  mmrVerified?: boolean;
  mmrFrozen?: boolean;
  staffRole?: import("../public-team").PublicTeamRole;
  xpAvailable?: boolean;
  dotaVisibility?: "private" | "public" | "unknown";
};

export function getMedalFromMMR(mmr: number, _leaderboardPosition?: number) {
  void _leaderboardPosition;
  if (!Number.isInteger(mmr) || mmr < 0)
    throw new Error("MMR must be a nonnegative integer");
  const medal = [...medals].reverse().find((item) => mmr >= item.min)!;
  return { ...medal, displayName: medal.name };
}

export function getRankFromMMR(mmr?: number | null) {
  if (mmr == null || !Number.isInteger(mmr) || mmr < 0)
    return {
      key: "unavailable",
      name: "Rango no disponible",
      label: "MMR no disponible",
      minMMR: null,
      icon: undefined,
      image: undefined,
    };
  const rank = getMedalFromMMR(mmr);
  return {
    ...rank,
    key:
      "variant" in rank
        ? rank.variant
        : rank.image.split("/").at(-1)!.split(".")[0],
    minMMR: rank.min,
    icon: rank.image,
    label: `${mmr.toLocaleString("en-US")} MMR`,
  };
}
export function getPlayerRank(player: {
  mmr: number;
  mmrAvailable?: boolean;
  dotaRankTier?: number | null;
}) {
  const rank = normalizeRank(player.dotaRankTier);
  if (rank)
    return {
      ...rank,
      key: String(rank.tier),
      minMMR: null,
      icon: rank.image,
      label: rank.stars ? `${rank.stars} estrellas` : "",
    };
  // An explicit cache projection is authoritative even when no rank is available.
  return getRankFromMMR(
    player.dotaRankTier !== undefined || player.mmrAvailable === false
      ? null
      : player.mmr,
  );
}

export function createCompetitiveStats(mmr: number): CompetitiveStats {
  getMedalFromMMR(mmr);
  return { mmr, elo: config.initialElo, xp: 0, level: 1 };
}

export function calculateEloChange({
  elo,
  opponentElo,
  won,
}: {
  elo: number;
  opponentElo: number;
  won: boolean;
}) {
  if (![elo, opponentElo].every(Number.isFinite))
    throw new Error("Invalid ELO");
  const expected = 1 / (1 + 10 ** ((opponentElo - elo) / config.eloScale));
  return Math.round(config.eloK * ((won ? 1 : 0) - expected));
}

export function xpNeeded(level: number) {
  return config.xpBase + (level - 1) * config.xpPerLevel;
}

export function getXpProgress(xp: number | bigint) {
  if (
    (typeof xp === "number" && (!Number.isSafeInteger(xp) || xp < 0)) ||
    (typeof xp === "bigint" &&
      (xp < BigInt(0) || xp > BigInt("9223372036854775807")))
  )
    throw new Error("Invalid XP");
  const total = BigInt(xp),
    base = BigInt(config.xpBase),
    increment = BigInt(config.xpPerLevel);
  const consumed = (levels: bigint) =>
    levels * base + ((levels * (levels - BigInt(1))) / BigInt(2)) * increment;
  let low = BigInt(0),
    high = BigInt(1);
  while (consumed(high) <= total) high *= BigInt(2);
  while (high - low > BigInt(1)) {
    const middle = (low + high) / BigInt(2);
    if (consumed(middle) <= total) low = middle;
    else high = middle;
  }
  const level = Number(low) + 1;
  return {
    level,
    current: Number(total - consumed(low)),
    required: xpNeeded(level),
  };
}

export function applyMatchResult(
  stats: CompetitiveStats,
  won: boolean,
  opponentElo: number,
): CompetitiveStats {
  const xp = stats.xp + config.xpPerMatch + (won ? config.xpWinBonus : 0);
  return {
    ...stats,
    xp,
    level: getXpProgress(xp).level,
    elo: stats.elo + calculateEloChange({ elo: stats.elo, opponentElo, won }),
  };
}

// Exhaustive 5-of-10 search (252 combinations), independent of component state.
// Supply a different scoring function later to incorporate ELO or other factors.
export function balanceTeams<T extends { id: string; mmr: number }>(
  players: T[],
  score: (player: T) => number = (player) => player.mmr,
  preferredRadiantIds: readonly string[] = [],
  pinned: { radiant?: readonly string[]; dire?: readonly string[] } = {},
) {
  if (
    players.length !== 10 ||
    new Set(players.map((player) => player.id)).size !== 10
  )
    throw new Error("Ten distinct players required");
  const scores = players.map(score);
  const identities = new Set(players.map((p) => p.id));
  if (
    [...(pinned.radiant ?? []), ...(pinned.dire ?? [])].some(
      (id) => !identities.has(id),
    ) ||
    pinned.radiant?.some((id) => pinned.dire?.includes(id))
  )
    throw new Error("Invalid captain constraints");
  if (!scores.every(Number.isFinite)) throw new Error("Invalid balance score");
  const total = scores.reduce((a, b) => a + b, 0);
  let best: number[] = [];
  let difference = Infinity;
  let fewestMoves = Infinity;
  const preferred = new Set(preferredRadiantIds);
  function search(indices: number[], start: number, sum: number) {
    if (indices.length === 5) {
      const selected = new Set(indices.map((i) => players[i].id));
      if (
        pinned.radiant?.some((id) => !selected.has(id)) ||
        pinned.dire?.some((id) => selected.has(id))
      )
        return;
      const delta = Math.abs(total - 2 * sum);
      // Among equally optimal splits, preserve as many current places as possible.
      const moves = indices.filter(
        (index) => !preferred.has(players[index].id),
      ).length;
      if (delta < difference || (delta === difference && moves < fewestMoves)) {
        best = [...indices];
        difference = delta;
        fewestMoves = moves;
      }
      return;
    }
    for (let i = start; i <= players.length - (5 - indices.length); i++)
      search([...indices, i], i + 1, sum + scores[i]);
  }
  search([], 0, 0);
  if (best.length !== 5) throw new Error("No valid team distribution");
  return {
    radiant: players.filter((_, index) => best.includes(index)),
    dire: players.filter((_, index) => !best.includes(index)),
    difference: difference / 5,
  };
}
