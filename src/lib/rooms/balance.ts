import { balanceTeams, type Player } from "../competitive";
import { roomConfig } from "./config";

export function teamMetrics(radiant: Player[], dire: Player[]) {
  const summarize = (players: Player[]) => {
    const known = players.filter(
      (player) =>
        player.mmrAvailable !== false &&
        Number.isSafeInteger(player.mmr) &&
        player.mmr > 0,
    );
    const total = known.reduce((sum, player) => sum + player.mmr, 0);
    return {
      total,
      average: known.length ? total / known.length : 0,
      available: known.length,
      complete: known.length === players.length,
    };
  };
  const a = summarize(radiant),
    b = summarize(dire);
  return {
    radiant: a,
    dire: b,
    complete: a.complete && b.complete,
    totalDifference: Math.abs(a.total - b.total),
    averageDifference: Math.abs(a.average - b.average),
  };
}

export function rosterSignature(radiant: Player[], dire: Player[]) {
  return JSON.stringify(
    [radiant, dire].map((team) =>
      team
        .map((player) => [player.id, player.mmr, player.mmrAvailable !== false])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "en")),
    ),
  );
}

export function createBalanceProposal(
  radiant: Player[],
  dire: Player[],
  proposedBy: string,
  captains?: { radiant: string; dire: string } | null,
) {
  if (
    radiant.length !== roomConfig.teamSize ||
    dire.length !== roomConfig.teamSize
  )
    throw new Error(
      "El balance requiere dos equipos completos de 5 jugadores.",
    );
  const players = [...radiant, ...dire];
  if (new Set(players.map((player) => player.id)).size !== players.length)
    throw new Error("No puede haber jugadores duplicados en el balance.");
  if (
    players.some(
      (player) =>
        player.mmrAvailable === false ||
        !Number.isSafeInteger(player.mmr) ||
        player.mmr <= 0,
    )
  )
    throw new Error(
      "Se necesita el MMR de los diez jugadores para calcular el balance.",
    );
  const balanced = balanceTeams(
    players,
    (player) => player.mmr,
    radiant.map((player) => player.id),
    captains ? { radiant: [captains.radiant], dire: [captains.dire] } : {},
  );
  return {
    proposedBy,
    source: rosterSignature(radiant, dire),
    beforeRadiantIds: radiant.map((player) => player.id),
    radiantIds: balanced.radiant.map((player) => player.id),
    direIds: balanced.dire.map((player) => player.id),
    before: teamMetrics(radiant, dire),
    after: teamMetrics(balanced.radiant, balanced.dire),
  };
}

export type BalanceProposal = ReturnType<typeof createBalanceProposal>;
