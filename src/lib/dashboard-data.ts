import type { Player } from "./competitive";
import type { Room } from "./room-mock-data";
import type { LobbyState, RoomPlayer } from "./rooms/engine";
import { roomConfig } from "./rooms/config";
import type { MatchCompletion } from "./rooms/recognition";
import { visibleHistoryCard } from "./match-visibility";
import { normalizeRoomMode } from "./rooms/lobby-options.mjs";

export type MatchTeam = {
  name?: string;
  playerCount?: number;
  players?: RoomPlayer[];
  captainId?: string;
  score?: number;
  mmrAverage?: number;
  eloAverage?: number;
};
type MatchInfo = {
  roomId?: string | null;
  historyVisible?: boolean;
  liveStartedAt?: string | null;
  serverNow?: string;
  tracking?: import("./real/match-tracking").MatchTracking;
  analytics?: import("./real/match-repository").PublicMatchAnalytics | null;
  heroCatalog?: import("./dota-stats/types").HeroCatalogEntry[];
  mvpUserId?: string | null;
  roomPublicId?: string | null;
  winningSide?: "RADIANT" | "DIRE" | null;
  id: string;
  name: string;
  mode: string;
  verifiedMode?: string;
  attemptFailed?: boolean;
  region?: string;
  host?: string;
  time?: string;
  playedAt?: string;
  radiant?: MatchTeam;
  dire?: MatchTeam;
  status?: "QUEUED" | "LOBBY_SENT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  statusLabel?: string;
};
export type DashboardMatch = MatchInfo & {
  result: "Victoria" | "Derrota" | "Sin resultado";
  playerId?: string;
  playerTeam?: "radiant" | "dire";
  eloBefore?: number;
  eloAfter?: number;
  eloChange?: number;
  pointsChange?: number;
  xpChange?: number;
  recognition?: MatchCompletion;
};
export type LiveMatch = MatchInfo & {
  radiant: MatchTeam;
  dire: MatchTeam;
  opponents?: [string, string];
};
export function getTeamAverages(players?: Player[]) {
  const average = (key: "mmr" | "elo") => {
    const values = players
      ?.filter((player) => key !== "mmr" || player.mmrAvailable !== false)
      .map((player) => player[key])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    return values?.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : undefined;
  };
  return { mmrAverage: average("mmr"), eloAverage: average("elo") };
}

export function toLiveMatch(
  room: Room,
  lobby?: Pick<LobbyState, "radiant" | "dire"> &
    Partial<Pick<LobbyState, "captains">>,
): LiveMatch {
  const opponents = room.title.split(/\s+vs\.?\s+/i);
  const team = (side: "radiant" | "dire"): MatchTeam => {
    const players = lobby?.[side];
    return {
      players,
      captainId: lobby?.captains?.[side],
      playerCount: players?.length ?? roomConfig.teamSize,
      ...getTeamAverages(players),
    };
  };
  return {
    id: room.id,
    name: room.title,
    mode: room.mode,
    region: room.region,
    host: room.host,
    radiant: team("radiant"),
    dire: team("dire"),
    opponents:
      opponents.length === 2 ? [opponents[0], opponents[1]] : undefined,
  };
}

export function formatMatchDate(playedAt?: string) {
  // Require a timestamp with its timezone, never infer the browser's timezone.
  if (
    !playedAt ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(playedAt)
  )
    return undefined;
  const date = new Date(playedAt);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;
}

export function getRecordedElo(matches: DashboardMatch[]) {
  const recorded = matches.filter(
    (match) =>
      typeof match.eloChange === "number" && Number.isFinite(match.eloChange),
  );
  return {
    count: recorded.length,
    total: recorded.reduce((total, match) => total + match.eloChange!, 0),
    complete: matches.length > 0 && recorded.length === matches.length,
  };
}
export function getRecentElo(matches: DashboardMatch[], limit = 5) {
  const recent = matches.slice(0, limit);
  return { ...getRecordedElo(recent), played: recent.length };
}

export const recentMatches: DashboardMatch[] = [
  {
    id: "friday",
    name: "Inhouse de viernes",
    result: "Victoria",
    time: "38:42",
    mode: "All Pick",
  },
  {
    id: "night",
    name: "Stack nocturno",
    result: "Derrota",
    time: "46:10",
    mode: "All Pick",
  },
  {
    id: "one-more",
    name: "Una más",
    result: "Victoria",
    time: "32:18",
    mode: "All Pick",
  },
];

export const activityPeriods = {
  "7d": { label: "Últimos 7 días", counts: [0, 1, 0, 0, 1, 0, 1] },
  "14d": { label: "Últimos 14 días", counts: [1, 2, 1, 3, 1, 2, 3] },
  "30d": { label: "Últimos 30 días", counts: [3, 4, 2, 6, 3, 5, 7] },
};

export function getMatchStats(matches: DashboardMatch[]) {
  const played = matches.filter(
    (match) =>
      visibleHistoryCard(match) &&
      ["Victoria", "Derrota"].includes(match.result) &&
      normalizeRoomMode(match.verifiedMode ?? match.mode) !== "ONE_V_ONE_MID",
  );
  const wins = played.filter((match) => match.result === "Victoria").length;
  const losses = played.filter((match) => match.result === "Derrota").length;
  return {
    played: played.length,
    wins,
    losses,
    winrate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
  };
}

export function completionToMatch(
  room: Room,
  completion: MatchCompletion,
  playerId: string,
): DashboardMatch | undefined {
  const result = completion.results.find((item) => item.playerId === playerId);
  if (!result) return undefined;
  const duration = completion.durationSeconds;
  return {
    id: completion.id,
    name: room.title,
    mode: room.mode,
    region: room.region,
    host: room.host,
    playedAt: new Date(completion.finishedAt).toISOString(),
    time:
      duration === undefined
        ? undefined
        : `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
    playerId,
    playerTeam: completion.radiant.some((player) => player.id === playerId)
      ? "radiant"
      : completion.dire.some((player) => player.id === playerId)
        ? "dire"
        : undefined,
    result:
      result.won === undefined
        ? "Sin resultado"
        : result.won
          ? "Victoria"
          : "Derrota",
    eloChange: result.eloChange,
    pointsChange: result.pointsChange,
    xpChange: result.xpChange,
    radiant: {
      players: completion.radiant,
      captainId: completion.captains?.radiant,
    },
    dire: { players: completion.dire, captainId: completion.captains?.dire },
    recognition: completion,
  };
}
