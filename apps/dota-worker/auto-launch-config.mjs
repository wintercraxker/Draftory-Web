import { normalizeRoomMode } from "../../src/lib/rooms/lobby-options.mjs";
export function newAttemptAutoLaunch(attempt, env = process.env) {
  if (env.DRAFTORY_ENABLE_DOTA_AUTO_LAUNCH !== "true") return false;
  if (env.DRAFTORY_DOTA_TEST_MATCH_ID)
    return (
      attempt.id === env.DRAFTORY_DOTA_TEST_MATCH_ID &&
      normalizeRoomMode(attempt.mode) === "ONE_V_ONE_MID"
    );
  const after = Date.parse(env.DRAFTORY_DOTA_AUTO_LAUNCH_AFTER ?? "");
  const created = Date.parse(attempt.createdAt ?? "");
  const modes = (env.DRAFTORY_DOTA_AUTO_LAUNCH_MODES ?? "").split(",");
  return (
    Number.isFinite(after) &&
    Number.isFinite(created) &&
    created >= after &&
    modes.includes(normalizeRoomMode(attempt.mode)) &&
    modes.every((m) =>
      ["ALL_PICK", "CAPTAINS_MODE", "ONE_V_ONE_MID", "TURBO"].includes(m),
    )
  );
}
