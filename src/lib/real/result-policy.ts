import { isMatchAnalytics } from "../dota-stats/match-analytics";
import { normalizeRoomMode, roomFormat } from "../rooms/lobby-options.mjs";
import { steamAccountId } from "../auth/openid";

// Authenticated STRATZ GameModeEnumType introspection, 2026-10-08.
// These provider enum names are distinct from Valve protobuf DOTA_GAMEMODE_* names.
const modes: Record<string, string> = {
  ALL_PICK: "ALL_PICK",
  CAPTAINS_MODE: "CAPTAINS_MODE",
  TURBO: "TURBO",
  ONE_V_ONE_MID: "SOLO_MID",
};
// Cache-only verifier. Missing fields, private players or disagreements block settlement.
// The caller must additionally prove the persistent GC link and running attempt.
export function verifiedResult(
  value: unknown,
  expected: {
    externalId: string;
    mode: string;
    createdAt: Date;
    players: { steamId: string; team: string }[];
  },
  now: Date,
) {
  if (
    !isMatchAnalytics(value, expected.externalId) ||
    !Array.isArray(value.conflicts) ||
    value.conflicts.length ||
    typeof value.radiantWin !== "boolean" ||
    !Number.isSafeInteger(value.duration) ||
    value.duration! <= 0
  )
    return null;
  const mode = normalizeRoomMode(expected.mode);
  if (!mode || value.gameMode !== modes[mode]) return null;
  for (const key of [
    "startedAt",
    "endedAt",
    "duration",
    "radiantWin",
    "gameMode",
  ])
    if (value.provenance[key] !== value.source) return null;
  const start = new Date(value.startedAt ?? ""),
    end = new Date(value.endedAt ?? "");
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start < expected.createdAt ||
    end <= start ||
    end > now ||
    value.duration! > 86400
  )
    return null;
  const count = roomFormat(mode).players;
  if (
    expected.players.length !== count ||
    value.players.length !== count ||
    new Set(expected.players.map((p) => p.steamId)).size !== count ||
    new Set(value.players.map((p) => p.accountId)).size !== count
  )
    return null;
  for (const side of ["RADIANT", "DIRE"])
    if (
      expected.players.filter((p) => p.team === side).length !== count / 2 ||
      value.players.filter((p) => p.side === side).length !== count / 2
    )
      return null;
  for (const p of expected.players) {
    const account = steamAccountId(p.steamId),
      found = value.players.find((a) => a.accountId === account);
    if (
      !found ||
      found.side !== p.team ||
      (!found.heroId && value.source !== "GC") ||
      value.provenance[`players.${account}.side`] !== value.source
    )
      return null;
  }
  return {
    winningSide: value.radiantWin ? ("RADIANT" as const) : ("DIRE" as const),
    startedAt: start,
    finishedAt: end,
    durationSeconds: value.duration!,
    rewards: roomFormat(mode).rewards,
  };
}
