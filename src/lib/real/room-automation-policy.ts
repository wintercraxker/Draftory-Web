import { normalizeRoomMode } from "../rooms/lobby-options.mjs";

// Mirrors the CURRENT public worker approval, not the format's player count.
// Enabling Solo Mid requires a separately reviewed worker/policy activation.
const approvedPublicModes = new Set([
  "ALL_PICK",
  "CAPTAINS_MODE",
  "TURBO",
  "ONE_V_ONE_MID",
]);
export function roomAutomationBlocker(
  mode: string,
  env = process.env,
): string | null {
  if (
    env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE !== "true" ||
    env.DRAFTORY_DOTA_ADMISSION !== "ELIGIBLE_ROOMS"
  )
    return null;
  const normalized = normalizeRoomMode(mode);
  const configured = (env.DRAFTORY_DOTA_AUTO_LAUNCH_MODES ?? "")
    .split(",")
    .map((value) => value.trim());
  if (
    normalized &&
    approvedPublicModes.has(normalized) &&
    configured.includes(normalized)
  )
    return null;
  return normalized === "ONE_V_ONE_MID"
    ? "El lobby automático y Launch de 1v1 están pendientes de autorización. Puedes organizar un participante por equipo y usar el chat."
    : "La automatización de este modo no está autorizada. La sala y sus jugadores se conservan.";
}
