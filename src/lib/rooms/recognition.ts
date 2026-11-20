import { applyMatchResult } from "../competitive";
import type { LobbyState, Team, RoomPlayer } from "./engine";
import { roomConfig } from "./config";
import { pointsConfig } from "../progression/config";

export type MatchCompletion = {
  id: string;
  finishedAt: number;
  startedAt?: number;
  durationSeconds?: number;
  radiant: RoomPlayer[];
  dire: RoomPlayer[];
  captains?: { radiant: string; dire: string } | null;
  winningTeam?: Team;
  results: {
    playerId: string;
    won?: boolean;
    eloChange?: number;
    pointsChange?: number;
    xpChange?: number;
  }[];
  voteEndsAt: number;
  commends: { from: string; to: string }[];
  finalized: boolean;
  mvpIds: string[];
};

export function finishLobbyMatch(
  state: LobbyState,
  now: number,
  winningTeam?: Team,
  durationSeconds?: number,
): LobbyState {
  if (state.phase !== "IN_GAME")
    throw new Error("La partida todavía no está en curso.");
  const players = [...state.radiant, ...state.dire];
  if (
    state.radiant.length !== roomConfig.teamSize ||
    state.dire.length !== roomConfig.teamSize ||
    new Set(players.map((p) => p.id)).size !== 10
  )
    throw new Error("Se requieren los diez participantes de la partida.");
  if (winningTeam !== undefined && !["radiant", "dire"].includes(winningTeam))
    throw new Error("Resultado inválido.");
  if (
    durationSeconds !== undefined &&
    (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0)
  )
    throw new Error("Duración inválida.");
  const averages = {
    radiant: state.radiant.reduce((sum, p) => sum + p.elo, 0) / 5,
    dire: state.dire.reduce((sum, p) => sum + p.elo, 0) / 5,
  };
  const results: MatchCompletion["results"] = [];
  const update = (team: Team) =>
    state[team].map((player) => {
      if (!winningTeam) {
        results.push({ playerId: player.id });
        return { ...player };
      }
      const stats = applyMatchResult(
        player,
        team === winningTeam,
        averages[team === "radiant" ? "dire" : "radiant"],
      );
      results.push({
        playerId: player.id,
        won: team === winningTeam,
        eloChange: stats.elo - player.elo,
        xpChange: stats.xp - player.xp,
        pointsChange:
          team === winningTeam ? pointsConfig.victory : pointsConfig.defeat,
      });
      return { ...player, ...stats };
    });
  const radiant = update("radiant"),
    dire = update("dire");
  const completion: MatchCompletion = {
    id: state.attempt?.id ?? `${state.roomId}:demo-match`,
    finishedAt: now,
    startedAt: state.matchStartedAt,
    durationSeconds,
    radiant,
    dire,
    captains: state.captains ? { ...state.captains } : null,
    winningTeam,
    results,
    voteEndsAt: now + roomConfig.commendVotingDurationMs,
    commends: [],
    finalized: false,
    mvpIds: [],
  };
  return {
    ...state,
    phase: "FINISHED",
    radiant,
    dire,
    completion,
    cancelVote: state.cancelVote
      ? { ...state.cancelVote, status: "CLOSED" }
      : undefined,
  };
}

export function commendPlayer(
  match: MatchCompletion,
  actor: string,
  recipient: string,
  now: number,
): MatchCompletion {
  if (match.finalized || now >= match.voteEndsAt)
    throw new Error("El período de Commend ha terminado.");
  const ids = [...match.radiant, ...match.dire].map((p) => p.id);
  if (!ids.includes(actor) || !ids.includes(recipient) || actor === recipient)
    throw new Error("Puedes reconocer a otro participante de la partida.");
  const existing = match.commends.find((vote) => vote.from === actor);
  if (existing) {
    if (existing.to === recipient) return match;
    throw new Error("Ya enviaste tu Commend en esta partida.");
  }
  return {
    ...match,
    commends: [...match.commends, { from: actor, to: recipient }],
  };
}

export function closeCommends(
  match: MatchCompletion,
  now: number,
): MatchCompletion {
  if (match.finalized || now < match.voteEndsAt) return match;
  const counts = new Map<string, number>();
  for (const vote of match.commends)
    counts.set(vote.to, (counts.get(vote.to) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  return {
    ...match,
    finalized: true,
    mvpIds: max
      ? [...match.radiant, ...match.dire]
          .filter((p) => counts.get(p.id) === max)
          .map((p) => p.id)
      : [],
  };
}

// Recomputing from unique match IDs avoids duplicate awards on retries/reconnects.
export function getRecognitionStats(
  playerId: string,
  matches: MatchCompletion[],
) {
  const unique = [
    ...new Map(matches.map((match) => [match.id, match])).values(),
  ];
  return {
    commends: unique.reduce(
      (sum, match) =>
        sum + match.commends.filter((vote) => vote.to === playerId).length,
      0,
    ),
    mvps: unique.filter(
      (match) => match.finalized && match.mvpIds.includes(playerId),
    ).length,
  };
}
