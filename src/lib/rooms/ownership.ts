// Keep this policy aligned with Room_one_active_creator in PostgreSQL.
// A cancelled launch/ready attempt returns to READY; it does not close the room.
export const terminalRoomPhases = ["FINISHED", "CANCELLED"] as const;
export const activeRoomConflictCode = "ACTIVE_ROOM_EXISTS";
export function isActiveRoomPhase(phase: string) {
  return !terminalRoomPhases.some((terminal) => terminal === phase);
}
