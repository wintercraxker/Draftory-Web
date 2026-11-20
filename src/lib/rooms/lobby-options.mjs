// Shared by the web validator and worker serialization. No profile preferences.
// Game modes: GameTracking-Dota2/Protobufs/dota_shared_enums.proto.
// Server regions: ValvePython/dota2/common_enums.py, EServerRegion.
export const roomModes = Object.freeze([
  { value: "ALL_PICK", label: "All Pick", gcCode: 1, competitive: true },
  {
    value: "ONE_V_ONE_MID",
    label: "1v1 Central",
    gcCode: 21,
    competitive: true,
  },
  {
    value: "CAPTAINS_MODE",
    label: "Captains Mode",
    gcCode: 2,
    competitive: true,
  },
  { value: "TURBO", label: "Turbo", gcCode: 23, competitive: true },
]);
export const roomServers = Object.freeze([
  { value: "BRAZIL", label: "Brasil", gcCode: 10 },
  { value: "ARGENTINA", label: "Argentina", gcCode: null }, // No verified GC region: fail closed.
  { value: "CHILE", label: "Chile", gcCode: 14 },
  { value: "PERU", label: "Perú", gcCode: 15 },
  { value: "US_EAST", label: "EE.UU. (este)", gcCode: 2 },
  { value: "US_WEST", label: "EE.UU. (oeste)", gcCode: 1 },
  { value: "EUROPE", label: "Europa", gcCode: 3 }, // EU West; legacy Europa still requires an explicit choice in worker.
]);
const modeAliases = {
  "All Pick": "ALL_PICK",
  "Captain's Mode": "CAPTAINS_MODE",
  "Captains Mode": "CAPTAINS_MODE",
  "1vs1 Central": "ONE_V_ONE_MID",
  "1v1 Central": "ONE_V_ONE_MID",
  Turbo: "TURBO",
};
const serverAliases = {
  Sudamérica: "PERU",
  SA: "PERU",
  "US East": "US_EAST",
  "US West": "US_WEST",
  Europa: "EUROPE",
  Brasil: "BRAZIL",
  Argentina: "ARGENTINA",
  Chile: "CHILE",
  Perú: "PERU",
};
export function normalizeRoomMode(value) {
  return (
    roomModes.find((v) => v.value === (modeAliases[value] ?? value))?.value ??
    null
  );
}
export function normalizeRoomServer(value) {
  return (
    roomServers.find((v) => v.value === (serverAliases[value] ?? value))
      ?.value ?? null
  );
}
export function roomModeLabel(value) {
  return (
    roomModes.find((v) => v.value === normalizeRoomMode(value))?.label ?? value
  );
}
export function roomServerLabel(value) {
  return (
    roomServers.find((v) => v.value === normalizeRoomServer(value))?.label ??
    value
  );
}
// The same format contract is consumed by web authority and the worker.
export function roomFormat(value = "ALL_PICK") {
  const mode =
    typeof value === "number"
      ? roomModes.find((m) => m.gcCode === value)?.value
      : normalizeRoomMode(value);
  if (!mode) throw new Error("UNSUPPORTED_COMPETITIVE_MODE");
  return Object.freeze(
    mode === "ONE_V_ONE_MID"
      ? {
          teamSize: 1,
          players: 2,
          playerDraft: false,
          rewards: false,
          cancellationVotes: 2,
        }
      : {
          teamSize: 5,
          players: 10,
          playerDraft: true,
          rewards: true,
          cancellationVotes: 8,
        },
  );
}
export function competitiveRoomBlocker(mode, server) {
  const game = roomModes.find((v) => v.value === normalizeRoomMode(mode)),
    region = roomServers.find((v) => v.value === normalizeRoomServer(server));
  if (!game?.competitive)
    return "El inicio de 1v1 Central queda pendiente de definir sus reglas. Esta sala conserva sus jugadores.";
  if (!region || region.gcCode === null)
    return "Este servidor todavía no tiene una integración Dota verificada. No se iniciará un intento.";
  return null;
}
