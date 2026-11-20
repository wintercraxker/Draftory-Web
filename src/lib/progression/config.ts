export const pointsConfig = {
  initial: 0,
  victory: 100,
  defeat: 50,
  predictionDurationMs: 5 * 60_000,
  minPrediction: 10,
};
export const achievementXpRewards = {
  first: 25,
  firstwin: 50,
  streak: 100,
  veteran: 250,
  wins: 150,
  commended: 100,
  mvp: 75,
  legend: 400,
  ascension: 75,
  competitor: 150,
} as const;
export const achievementPointRewards = {
  first: 50,
  firstwin: 100,
  mvp: 100,
  veteran: 250,
} as const;
export const oddsConfig = {
  minOdds: 1.15,
  maxOdds: 5,
  margin: 0.05,
  mmrWeight: 0.35,
  eloWeight: 0.4,
  recentFormWeight: 0.25,
  marketWeight: 0.12,
  maxMovementPerUpdate: 0.03,
  mmrScale: 1500,
  eloScale: 1000,
  formScale: 4,
  priorStake: 200,
  recentMatches: 10,
};
export const achievementDefinitions = [
  {
    id: "first",
    name: "Primer paso",
    description: "Juega tu primera partida.",
    metric: "played",
    target: 1,
  },
  {
    id: "firstwin",
    name: "Primera victoria",
    description: "Gana una partida Draftory.",
    metric: "wins",
    target: 1,
  },
  {
    id: "streak",
    name: "En racha",
    description: "Gana tres partidas seguidas.",
    metric: "bestStreak",
    target: 3,
  },
  {
    id: "veteran",
    name: "Veterano",
    description: "Juega 50 partidas.",
    metric: "played",
    target: 50,
  },
  {
    id: "wins",
    name: "Imparable",
    description: "Gana diez partidas.",
    metric: "wins",
    target: 10,
  },
  {
    id: "commended",
    name: "Reconocido",
    description: "Recibe diez Commends.",
    metric: "commends",
    target: 10,
  },
  {
    id: "mvp",
    name: "MVP",
    description: "Consigue tu primer MVP.",
    metric: "mvps",
    target: 1,
  },
  {
    id: "legend",
    name: "Leyenda del lobby",
    description: "Consigue diez MVPs.",
    metric: "mvps",
    target: 10,
  },
  {
    id: "ascension",
    name: "Ascenso",
    description: "Alcanza el nivel 5 de Draftory.",
    metric: "level",
    target: 5,
  },
  {
    id: "competitor",
    name: "Competidor",
    description: "Alcanza 5.500 ELO Draftory.",
    metric: "elo",
    target: 5500,
  },
] as const;
export type Achievement = {
  id: (typeof achievementDefinitions)[number]["id"];
  name: string;
  description: string;
  metric: string;
  target: number;
  progress: number;
  rewardXp?: number;
  unlockedAt?: number;
};
export type PointsEntry = {
  id: string;
  type:
    | "VICTORY"
    | "DEFEAT"
    | "PREDICTION_STAKE"
    | "PREDICTION_WIN"
    | "PREDICTION_REFUND";
  amount: number;
  date: number;
  matchId: string;
};
