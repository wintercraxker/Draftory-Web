import { oddsConfig as config } from "./config";

export type StrengthPlayer = {
  id: string;
  mmr?: number;
  mmrAvailable?: boolean;
  elo?: number;
};
export type TeamStrength = {
  mmr?: number;
  mmrAvailable?: boolean;
  elo?: number;
  recentForm?: number;
  availableMetrics: number;
};
export type OddsQuote = {
  radiant: number;
  dire: number;
  radiantProbability: number;
  direProbability: number;
};
export function calculateTeamStrength(
  players: StrengthPlayer[],
  recentResults: (id: string) => boolean[] = () => [],
): TeamStrength {
  const average = (key: "mmr" | "elo") => {
    const available = players
      .filter((player) => key !== "mmr" || player.mmrAvailable !== false)
      .map((player) => player[key])
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
      );
    return available.length
      ? available.reduce((sum, value) => sum + value, 0) / available.length
      : undefined;
  };
  const form = players.flatMap((player) =>
    recentResults(player.id).slice(-config.recentMatches),
  );
  const mmr = average("mmr"),
    elo = average("elo"),
    recentForm = form.length
      ? form.filter(Boolean).length / form.length
      : undefined;
  return {
    mmr,
    elo,
    recentForm,
    availableMetrics: [mmr, elo, recentForm].filter(
      (value) => value !== undefined,
    ).length,
  };
}
export function calculateWinProbability(
  radiant: TeamStrength,
  dire: TeamStrength,
) {
  // Use only comparable metrics. Missing external data receives no invented value.
  const metrics = [
    {
      a: radiant.mmr,
      b: dire.mmr,
      weight: config.mmrWeight,
      scale: config.mmrScale,
    },
    {
      a: radiant.elo,
      b: dire.elo,
      weight: config.eloWeight,
      scale: config.eloScale,
    },
    {
      a: radiant.recentForm,
      b: dire.recentForm,
      weight: config.recentFormWeight,
      scale: 1 / config.formScale,
    },
  ].filter((metric) => metric.a !== undefined && metric.b !== undefined);
  const total = metrics.reduce((sum, metric) => sum + metric.weight, 0);
  const difference = total
    ? metrics.reduce(
        (sum, metric) =>
          sum + (metric.weight * (metric.a! - metric.b!)) / metric.scale,
        0,
      ) / total
    : 0;
  return 1 / (1 + Math.exp(-difference));
}
export function calculateOdds(
  probability: number,
  stakes = { radiant: 0, dire: 0 },
  previous?: OddsQuote,
): OddsQuote {
  const market =
    (stakes.radiant + config.priorStake * probability) /
    (stakes.radiant + stakes.dire + config.priorStake);
  const p = Math.max(
    0.01,
    Math.min(
      0.99,
      probability * (1 - config.marketWeight) + market * config.marketWeight,
    ),
  );
  const price = (chance: number, old?: number) => {
    const target = Math.max(
      config.minOdds,
      Math.min(config.maxOdds, (1 - config.margin) / chance),
    );
    const moved =
      old === undefined
        ? target
        : Math.max(
            old - config.maxMovementPerUpdate,
            Math.min(old + config.maxMovementPerUpdate, target),
          );
    return Math.round(moved * 100) / 100;
  };
  return {
    radiant: price(p, previous?.radiant),
    dire: price(1 - p, previous?.dire),
    radiantProbability: p,
    direProbability: 1 - p,
  };
}
