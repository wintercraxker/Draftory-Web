export type ClanRole = "LEADER" | "OFFICER" | "MEMBER";
export type ClanSummary = {
  id: string;
  name: string;
  tag: string;
  shield: string | null;
  count: number;
};
export type ClanMember = {
  id: string;
  name: string;
  publicId: string | null;
  avatar: string | null;
  role: ClanRole;
  preferredRole: string | null;
  href: string | null;
  level?: number | null;
  medal?: import("./player-hover").PlayerHoverProfile["medal"];
};
export type ClanDetail = ClanSummary & {
  description: string;
  createdAt: string;
  leaderId: string;
  members: ClanMember[];
  viewerRole: ClanRole | null;
  viewerRequest: "INVITE" | "APPLICATION" | null;
  requests: ClanJoinRequest[];
};
export type ClanJoinRequest = {
  id: string;
  clanId: string;
  clanName: string;
  tag: string;
  userId: string;
  name: string;
  publicId: string | null;
  kind: "INVITE" | "APPLICATION";
  createdAt: string;
};
export type ClanFeed = {
  enabled: boolean;
  mine: ClanDetail | null;
  invitations: ClanJoinRequest[];
  items: ClanSummary[];
  page: number;
  hasMore: boolean;
};
export const CLAN_LIMIT = 10;
export const clanRoleLabel = {
  LEADER: "Líder",
  OFFICER: "Oficial",
  MEMBER: "Miembro",
};
