import { createCompetitiveStats, type Player } from "./competitive";
import { demoPlayers } from "./rooms/mock";
import { classificationPlayers } from "./classification-data";
import { getMatchStats, type DashboardMatch } from "./dashboard-data";
import { getRecognitionStats, type MatchCompletion } from "./rooms/recognition";
import { getPreferredRole, type DotaRoleId } from "./dota-roles";
import type { Achievement } from "./progression/config";

export type PlayerProfileData = Player & {
  preferredRolePrimary: DotaRoleId;
  preferredRoleSecondary?: DotaRoleId | null;
  username: string;
  bio: string;
  country: string;
  region: string;
  visibility: string;
};
export type PublicProfile = {
  profile: PlayerProfileData;
  matches: DashboardMatch[];
  stats?: ReturnType<typeof getMatchStats>;
  social: ReturnType<typeof getRecognitionStats>;
  achievements?: Achievement[];
};
export const defaultProfile: PlayerProfileData = {
  id: "self",
  username: "draftory-demo",
  name: "Draftory Demo",
  avatar: "/globe.svg",
  bio: "Dota 2, buenos stacks y una partida más.",
  country: "Colombia",
  region: "Sudamérica",
  preferredRolePrimary: "mid",
  preferredRoleSecondary: null,
  visibility: "Público",
  ...createCompetitiveStats(4500),
};
const demo = demoPlayers(18);
// Existing mock identities and ranking metrics, never a fallback for unknown users.
export const profileDirectory: PlayerProfileData[] = [
  defaultProfile,
  ...demo.map((player) => {
    const rank = classificationPlayers.find(
      (record) => record.id === player.id,
    );
    return {
      ...player,
      preferredRolePrimary: getPreferredRole(player)!,
      preferredRoleSecondary: null,
      username: player.name.toLocaleLowerCase("en-US"),
      bio: "",
      country: rank?.country ?? "No especificado",
      region: "Sudamérica",
      visibility: "Público",
    };
  }),
];
export function profileHandle(player: Pick<Player, "id">) {
  return (
    profileDirectory.find((record) => record.id === player.id)?.username ??
    player.id
  );
}
export function profileHref(player: Pick<Player, "id">) {
  return `/profile/${encodeURIComponent(profileHandle(player))}`;
}
export function findProfile(handle: string) {
  return profileDirectory.find(
    (profile) =>
      profile.username === handle.toLocaleLowerCase("en-US") ||
      profile.id === handle,
  );
}
export function buildPublicProfile(
  profile: PlayerProfileData,
  matches: DashboardMatch[],
  completions: MatchCompletion[],
  own = false,
): PublicProfile {
  const ranked = classificationPlayers.find(
    (player) => player.id === profile.id,
  );
  const recorded = getMatchStats(matches);
  const played =
    !own && ranked?.played !== undefined
      ? ranked.played + recorded.played
      : recorded.played;
  const wins =
    !own && ranked?.wins !== undefined
      ? ranked.wins + recorded.wins
      : recorded.wins;
  const losses =
    !own && ranked?.played !== undefined && ranked.wins !== undefined
      ? ranked.played - ranked.wins + recorded.losses
      : recorded.losses;
  return {
    profile,
    matches,
    stats: {
      played,
      wins,
      losses,
      winrate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
    },
    social: getRecognitionStats(profile.id, completions),
  };
}
