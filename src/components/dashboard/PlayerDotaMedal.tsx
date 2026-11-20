import { getPlayerRank, type Player } from "@/lib/competitive";
import { DotaMedal } from "./DotaMedal";

// Shared team-card medal; internal level and ELO never supply its rank.
export function PlayerDotaMedal({ player }: { player: Player }) {
  const rank = getPlayerRank(player);
  if (!rank.image) return null;
  return (
    <span
      className="player-dota-medal"
      title={`${rank.name}${player.dotaRankStale ? " · Información anterior" : ""}`}
      data-stale={player.dotaRankStale === true}
    >
      <DotaMedal
        rankTier={player.dotaRankTier}
        leaderboardRank={player.leaderboardRank}
        image={rank.image}
        name={rank.name}
      />
    </span>
  );
}
