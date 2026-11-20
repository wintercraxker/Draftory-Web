import type { Room } from "../room-mock-data";
import type { LobbyState, RoomPlayer } from "../rooms/engine";
import type { RealMember, RealRoom } from "./types";
import { roomModeLabel, roomServerLabel } from "../rooms/lobby-options.mjs";

// Projection only: no demo fixtures, local reducer or optimistic roster.
export function presentRoom(room: RealRoom): Room {
  const status: Room["status"] =
    room.phase === "IN_GAME"
      ? room.liveConfirmed ||
        room.competitive?.dotaLobby?.productStatus === "STARTED"
        ? "live"
        : "preparing"
      : room.phase === "DRAFTING"
        ? "draft"
        : room.phase === "READY_CHECK"
          ? "ready_check"
          : room.phase === "PREPARING"
            ? "preparing"
            : room.phase === "WAITING_FOR_PLAYERS"
              ? "waiting_for_players"
              : room.phase === "FINISHED"
                ? "finished"
                : "waiting";
  return {
    id: room.id,
    title: room.name,
    mode: roomModeLabel(room.mode),
    region: roomServerLabel(room.region),
    host: room.creatorName,
    hostId: room.creatorId,
    players: room.participants,
    isPrivate: room.isPrivate,
    formation: room.formation === "CAPTAINS" ? "captains" : "automatic",
    status,
  };
}
export function presentMember(member: RealMember): RoomPlayer {
  return {
    id: member.userId,
    name: member.name,
    avatar: member.avatar ?? undefined,
    roomRole: member.roomRole,
    online: member.online,
    dotaRankTier: member.dotaRankTier,
    dotaRankStale: member.dotaRankStale,
    leaderboardRank: member.leaderboardRank,
    mmr: member.mmr ?? 0,
    mmrAvailable: member.mmr !== null,
    mmrVerified: member.mmrVerified,
    mmrFrozen: member.mmrFrozen,
    staffRole: member.staffRole,
    elo: member.elo ?? NaN,
    level: member.level ?? NaN,
    xp: 0,
    xpAvailable: false,
  };
}
export function presentLobby(room: RealRoom): LobbyState {
  const members = room.members ?? [];
  const team = (side: RealMember["team"]) =>
    members.filter((member) => member.team === side).map(presentMember);
  const radiantCaptain = members.find(
    (member) => member.isCaptain && member.team === "RADIANT",
  );
  const direCaptain = members.find(
    (member) => member.isCaptain && member.team === "DIRE",
  );
  return {
    mode: room.mode,
    hostId: room.creatorId,
    roomId: room.id,
    phase: room.phase as LobbyState["phase"],
    formation:
      room.mode === "ONE_V_ONE_MID"
        ? "automatic"
        : room.formation === "CAPTAINS"
          ? "captains"
          : "automatic",
    game: (room.firstPickMethod?.toLowerCase() ?? "roll") as LobbyState["game"],
    radiant: team("RADIANT"),
    dire: team("DIRE"),
    bench: team("BENCH"),
    captains:
      radiantCaptain || direCaptain
        ? {
            radiant: radiantCaptain?.userId ?? "",
            dire: direCaptain?.userId ?? "",
          }
        : null,
    // These subsystems are not loaded yet. Their controls are explicitly disabled.
    messages: [],
    invitations: [],
    first: null,
    pick: 0,
    dice: {},
    choicesReady: {},
    reveal: null,
    balanceProposal: null,
    ...room.competitive,
  };
}
