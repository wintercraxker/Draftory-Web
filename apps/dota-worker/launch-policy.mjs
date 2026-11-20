import { createHash } from "node:crypto";
import { validateRoster } from "./contracts.mjs";
import { botNonPlaying, humanPlayer } from "./bot-position.mjs";
export const warnings = Object.freeze({
  RADIANT_WRONG:
    "Un jugador asignado a Radiant está en el equipo contrario. Revisen sus posiciones según Draftory.",
  DIRE_WRONG:
    "Un jugador asignado a Dire está en el equipo contrario. Revisen sus posiciones según Draftory.",
  UNKNOWN:
    "Hay participantes que no corresponden a esta sala de Draftory. Revisen los equipos.",
  MISSING:
    "Esperando a que todos los participantes de Draftory entren al lobby.",
  READY:
    "Todos los participantes están en sus equipos correctos. Preparando el inicio de la partida.",
});
export function rosterHash(players, mode, region) {
  validateRoster(players, mode);
  return createHash("sha256")
    .update(
      JSON.stringify({
        mode,
        region,
        players: players
          .map((p) => [p.userId, p.steamId, p.teamSide, p.slot])
          .sort((a, b) => a[0].localeCompare(b[0])),
      }),
    )
    .digest("hex");
}
export function inspectTeams(context, evidence) {
  validateRoster(context.players, context.gameMode);
  if (
    !evidence ||
    evidence.lobbyId !== context.lobbyId ||
    evidence.ownerSteamId !== context.worker.steamId ||
    evidence.gameMode !== context.gameMode ||
    evidence.serverRegion !== context.serverRegion ||
    evidence.stateCode !== 0 ||
    evidence.matchId !== null ||
    evidence.rosterComplete !== true ||
    !Array.isArray(evidence.members)
  )
    return { ok: false, kind: null };
  const members = evidence.members;
  if (new Set(members.map((m) => m.steamId)).size !== members.length)
    return { ok: false, kind: "UNKNOWN" };
  // Positive SPECTATOR or explicit COACH/non-player evidence; absence is insufficient.
  const bot = members.find((m) => m.steamId === context.worker.steamId);
  if (!botNonPlaying(bot)) return { ok: false, kind: "UNKNOWN" };
  if (
    members.some(
      (m) =>
        m.steamId !== context.worker.steamId &&
        !context.players.some((p) => p.steamId === m.steamId),
    )
  )
    return { ok: false, kind: "UNKNOWN" };
  for (const p of context.players) {
    const m = members.find((m) => m.steamId === p.steamId);
    if (!m) return { ok: false, kind: "MISSING" };
    if (!humanPlayer(m)) return { ok: false, kind: "UNKNOWN" };
    if (m.teamCode !== (p.teamSide === "RADIANT" ? 0 : 1))
      return {
        ok: false,
        kind:
          m.teamCode === 0 || m.teamCode === 1
            ? p.teamSide === "RADIANT"
              ? "RADIANT_WRONG"
              : "DIRE_WRONG"
            : "UNKNOWN",
      };
    // Live Solo Mid GC evidence uses slot 1 for the first UI position.
    // Preserve raw GC slots; other modes keep their existing mapping.
    const rawSlot = context.gameMode === 21 ? p.slot : p.slot - 1;
    if (m.slotCode !== rawSlot) return { ok: false, kind: "UNKNOWN" };
  }
  for (const team of [0, 1]) {
    const known = members
      .filter((m) => m.teamCode === team)
      .map((m) => m.slotCode);
    if (
      known.some(
        (s) =>
          !Number.isInteger(s) ||
          (context.gameMode === 21 ? s !== 1 : s < 0 || s > 4),
      ) ||
      new Set(known).size !== known.length
    )
      return { ok: false, kind: "UNKNOWN" };
  }
  return { ok: true, kind: "READY" };
}
