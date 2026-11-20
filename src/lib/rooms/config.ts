export const roomConfig = {
  maxParticipants: 200,
  teamSize: 5,
  draftTurnDurationMs: 30_000,
  statusHighlightMs: 1800,
  playerMoveAnimationMs: 220,
  cancellationVotesRequired: 8,
  commendVotingDurationMs: 5 * 60_000,
  readyCheckDurationMs: 60_000,
  readyCheckHeartbeatMs: 1000,
  // Relative to the captain who wins first pick, eight picks plus two captains.
  pickOrder: ["A", "B", "B", "A", "A", "B", "B", "A"] as const,
  balanceThresholds: [
    { max: 100, label: "Muy equilibrado" },
    { max: 250, label: "Equilibrado" },
    { max: 500, label: "Diferencia moderada" },
    { max: Infinity, label: "Desequilibrado" },
  ],
  messageMaxLength: 500,
  inviteDurationMs: 60_000,
  diceAnimationMs: 900,
  rollMin: 1,
  rollMax: 90,
  rollFrameMs: 65,
  diceMin: 1,
  diceMax: 6,
  rpsRevealMs: 1800,
};

export const firstPickMethods = [
  { id: "roll", label: "Sorteo 1–90" },
  { id: "dice", label: "Dado clásico 1–6" },
  { id: "rps", label: "Piedra, papel o tijera" },
] as const;
export type FirstPickGame = (typeof firstPickMethods)[number]["id"];
export function getRollRange(game: FirstPickGame) {
  if (game === "roll")
    return { min: roomConfig.rollMin, max: roomConfig.rollMax };
  if (game === "dice")
    return { min: roomConfig.diceMin, max: roomConfig.diceMax };
  throw new Error("Este método no utiliza un lanzamiento numérico.");
}
