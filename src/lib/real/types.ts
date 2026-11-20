import type { DotaRoleId } from "../dota-roles";
export type PrivateProfile = {
  projection: "PRIVATE";
  id: string;
  name: string;
  avatar: string | null;
  publicId: string | null;
  level: number;
  visibility: "PRIVATE";
};
export type ProfileProjection = RealProfile | PrivateProfile;
export type RealProfile = {
  id: string;
  publicId: string | null;
  name: string;
  avatar: string | null;
  handle: string | null;
  bio: string;
  country: string | null;
  region: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  preferredRolePrimary: DotaRoleId;
  preferredRoleSecondary: DotaRoleId | null;
  elo: number;
  xp: string;
  level: number;
  points: string;
  createdAt: string;
  dota: {
    mmr: number | null;
    mmrSource: string;
    leaderboardRank: number | null;
    visibility: string;
  };
};
export type RealMember = {
  userId: string;
  name: string;
  avatar: string | null;
  team: "BENCH" | "RADIANT" | "DIRE";
  roomRole: DotaRoleId | null;
  isCaptain: boolean;
  online?: boolean;
  elo: number | null;
  level: number | null;
  mmr: number | null;
  mmrVerified?: boolean;
  mmrFrozen?: boolean;
  staffRole?: import("../public-team").PublicTeamRole;
  dotaRankTier?: number | null;
  dotaRankStale?: boolean;
  leaderboardRank?: number;
};
export type CompetitiveView = Pick<
  import("../rooms/engine").LobbyState,
  | "first"
  | "pick"
  | "pickOrder"
  | "messages"
  | "dice"
  | "choicesReady"
  | "reveal"
  | "firstPickStarted"
  | "firstPickSource"
  | "minigameRevealAt"
  | "draftTurn"
  | "highlight"
  | "balanceProposal"
  | "readyCheck"
  | "attempt"
  | "cancelVote"
  | "externalLobbyPending"
  | "externalCancellationPending"
  | "cancellationClosed"
  | "continuation"
  | "dotaLobby"
> & {
  roundId: string;
  serverNow: number;
  draftExpiredAt?: number;
  automationBlocker?: string | null;
};
export type RealRoom = {
  liveConfirmed?: boolean;
  presenceEnabled?: boolean;
  publicId?: string | null;
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  mode: string;
  region: string;
  phase: string;
  formation: string;
  firstPickMethod?: string;
  isPrivate: boolean;
  revision: number;
  participants: number;
  assigned: number;
  capacity: number;
  joined: boolean;
  members?: RealMember[];
  competitive?: CompetitiveView;
};
