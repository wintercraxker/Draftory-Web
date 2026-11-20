export type RoomMode = "ALL_PICK" | "ONE_V_ONE_MID" | "CAPTAINS_MODE" | "TURBO";
export type RoomServer =
  "BRAZIL" | "ARGENTINA" | "CHILE" | "PERU" | "US_EAST" | "US_WEST" | "EUROPE";
export const roomModes: readonly {
  value: RoomMode;
  label: string;
  gcCode: number;
  competitive: boolean;
}[];
export const roomServers: readonly {
  value: RoomServer;
  label: string;
  gcCode: number | null;
}[];
export function normalizeRoomMode(value: unknown): RoomMode | null;
export function normalizeRoomServer(value: unknown): RoomServer | null;
export function roomModeLabel(value: string): string;
export function roomServerLabel(value: string): string;
export function competitiveRoomBlocker(
  mode: string,
  server: string,
): string | null;
export function roomFormat(value?: string | number): {
  teamSize: number;
  players: number;
  playerDraft: boolean;
  rewards: boolean;
  cancellationVotes: number | null;
};
