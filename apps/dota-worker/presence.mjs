import { roomFormat } from "../../src/lib/rooms/lobby-options.mjs";
// DOTA_GC_TEAM, not the in-game DOTA_TEAM enum. Missing fields remain unknown.
export function observedTeam(code) {
  return code === 0 ? "RADIANT" : code === 1 ? "DIRE" : null;
}
export function teamProof(players, fresh, mode = "ALL_PICK") {
  const format = roomFormat(mode);
  return (
    fresh &&
    players.length === format.players &&
    new Set(players.map((p) => p.userId)).size === format.players &&
    players.filter((p) => p.team === "RADIANT").length === format.teamSize &&
    players.filter((p) => p.team === "DIRE").length === format.teamSize &&
    players.every((p) => p.observedAt && p.observedTeam === p.team)
  );
}
