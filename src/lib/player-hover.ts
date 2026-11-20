import type { ClanSummary } from "./clans";
export type PlayerHoverProfile = {
  identityBadges?: {
    staff: string | null;
    staffRole?: string | null;
    sponsor: boolean;
  };
  clan?: ClanSummary | null;
  name: string;
  avatar: string | null;
  publicId: string | null;
  href: string;
  elo: number;
  level: number;
  role: string | null;
  rankPosition: number | null;
  mmr: number | null;
  mmrSource: string | null;
  medal: {
    name: string;
    image: string;
    stars: number | null;
    stale: boolean;
    tier?: number;
    source?: "OPENDOTA_CACHE" | "MANUAL_PENDING" | "MANUAL_VERIFIED";
    leaderboardRank?: number | null;
  } | null;
  stats: {
    played: number;
    wins: number;
    losses: number;
    winrate: number | null;
  };
  achievements: {
    id: string;
    name: string;
    description: string;
    unlockedAt: string;
  }[];
  achievementCount?: number;
  socialLinks?: {
    platform: import("./profile-socials").SocialPlatform;
    url: string;
    source: "MANUAL" | "STEAM_DERIVED";
  }[];
};
export function hoverPosition(
  anchor: {
    left: number;
    right: number;
    top: number;
  },
  width: number,
  height: number,
  viewport: {
    width: number;
    height: number;
  },
) {
  const margin = 8,
    gap = 10;
  const left =
    anchor.right + gap + width <= viewport.width - margin
      ? anchor.right + gap
      : anchor.left - gap - width;
  return {
    left: Math.max(margin, Math.min(left, viewport.width - width - margin)),
    top: Math.max(
      margin,
      Math.min(anchor.top, viewport.height - height - margin),
    ),
  };
}
