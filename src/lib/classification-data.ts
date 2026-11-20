import type { Player } from "./competitive";
import { demoPlayers } from "./rooms/mock";
import { getMatchStats, type DashboardMatch } from "./dashboard-data";

export type RankedPlayer = Player & {
  country: string;
  role: string;
  played?: number;
  wins?: number;
  rank?: "staff" | "helper";
  badge?: string;
};
const roster = demoPlayers(18);
const demoPlayer = (name: string) =>
  roster.find((player) => player.name === name)!;
// Mock records only; replace this source with the competitive leaderboard API.
export const classificationPlayers: RankedPlayer[] = [
  { ...demoPlayer("Snok"), country: "Perú", role: "Mid", played: 42, wins: 24 },
  {
    ...demoPlayer("Vicky"),
    country: "Argentina",
    role: "Carry",
    played: 38,
    wins: 22,
  },
  {
    ...demoPlayer("Nova"),
    country: "Chile",
    role: "Offlane",
    played: 32,
    wins: 18,
    rank: "staff",
    badge: "Staff",
  },
  {
    ...demoPlayer("Mika"),
    country: "Colombia",
    role: "Support",
    played: 29,
    wins: 15,
    rank: "helper",
    badge: "Helper",
  },
  {
    ...demoPlayer("Kuro"),
    country: "México",
    role: "Hard Support",
    played: 25,
    wins: 12,
    rank: "helper",
    badge: "Helper",
  },
];
export function buildClassification(
  self: RankedPlayer,
  matches: DashboardMatch[],
  records = classificationPlayers,
) {
  const stats = getMatchStats(matches);
  const players = [...records.filter((player) => player.id !== self.id)];
  // Preserve the previous ordering for tied demo ELO; identity is never a name.
  players.splice(Math.min(2, players.length), 0, {
    ...self,
    played: stats.played,
    wins: stats.wins,
  });
  return players
    .sort((a, b) => b.elo - a.elo)
    .map((player, index) => ({
      ...player,
      position: index + 1,
      winrate:
        player.played !== undefined && player.wins !== undefined
          ? player.played
            ? (player.wins / player.played) * 100
            : 0
          : undefined,
    }));
}
