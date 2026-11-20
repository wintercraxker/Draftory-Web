import { roomFormat } from "../../src/lib/rooms/lobby-options.mjs";
import { randomUUID } from "node:crypto";

export const operations = Object.freeze([
  "CREATE_LOBBY",
  "INVITE_PLAYERS",
  "REFRESH_LOBBY",
  "CANCEL_LOBBY",
]);
export const leaseSeconds = 30;
export const safeErrors = Object.freeze([
  "TIMEOUT",
  "DISCONNECTED",
  "GC_REJECTED",
  "AMBIGUOUS_CREATE",
  "ATTEMPTS_EXHAUSTED",
]);
export const newId = () => randomUUID();

export function validSteamId(value) {
  if (typeof value !== "string" || !/^\d{17}$/.test(value)) return false;
  const account = BigInt(value) - 76561197960265728n;
  return account > 0n && account <= 4294967295n;
}

export function validateRoster(players, mode = "ALL_PICK") {
  const { players: count, teamSize } = roomFormat(mode);
  if (
    players.length !== count ||
    new Set(players.map((p) => p.userId)).size !== count ||
    new Set(players.map((p) => p.steamId)).size !== count
  )
    throw new Error("INVALID_ROSTER");
  for (const side of ["RADIANT", "DIRE"]) {
    const members = players.filter((p) => p.teamSide === side);
    if (
      members.length !== teamSize ||
      new Set(members.map((p) => p.slot)).size !== teamSize ||
      members.some(
        (p) => !Number.isInteger(p.slot) || p.slot < 1 || p.slot > teamSize,
      )
    )
      throw new Error("INVALID_ROSTER");
  }
  if (players.some((p) => !validSteamId(p.steamId)))
    throw new Error("STEAM_ID_REQUIRED");
}

export function backoffSeconds(attempt) {
  return Math.min(300, 5 * 2 ** Math.max(0, Math.min(10, attempt - 1)));
}
