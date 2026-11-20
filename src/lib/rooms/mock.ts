import { createCompetitiveStats, type Player } from "../competitive";
import { dotaRoles } from "../dota-roles";

const names = [
  "Snok",
  "Vicky",
  "Nova",
  "Mika",
  "Kuro",
  "Riven",
  "Luna",
  "Nox",
  "Atlas",
  "Sol",
  "Echo",
  "Lina",
  "Rex",
  "Nia",
  "Ari",
  "Zen",
  "Kai",
  "Yuki",
];
export function demoPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo-${index}`,
    name: names[index % names.length],
    preferredRolePrimary: dotaRoles[index % dotaRoles.length].id,
    ...createCompetitiveStats(1800 + index * 270),
  }));
}
