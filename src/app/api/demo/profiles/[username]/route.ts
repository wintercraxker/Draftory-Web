import {
  findProfile,
  buildPublicProfile,
  type PlayerProfileData,
} from "@/lib/player-profiles";
import { readMatchLedger, readParticipant } from "@/lib/rooms/match-ledger";
import { completionToMatch, recentMatches } from "@/lib/dashboard-data";
import {
  getAchievements,
  readConfiguredProfile,
} from "@/lib/progression/server";

import { getPreferredRole } from "@/lib/dota-roles";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const base = findProfile(username);
  const registered = readParticipant(base?.id ?? username);
  if (!base && !registered)
    return Response.json(
      { error: "No encontramos este perfil." },
      { status: 404 },
    );
  const configured = base ? readConfiguredProfile(base.id) : undefined;
  const profile: PlayerProfileData = base
    ? {
        ...base,
        ...registered,
        ...configured,
        preferredRolePrimary:
          configured?.preferredRolePrimary ??
          getPreferredRole(registered ?? base) ??
          base.preferredRolePrimary,
        elo: registered?.elo ?? base.elo,
        xp: registered?.xp ?? base.xp,
        level: registered?.level ?? base.level,
      }
    : {
        ...registered!,
        preferredRolePrimary: getPreferredRole(registered!)!,
        username,
        bio: "",
        country: "No especificado",
        region: "No especificada",
        visibility: "Público",
      };
  const records = readMatchLedger(Date.now());
  const completed = records
    .map((record) => completionToMatch(record.room, record.match, profile.id))
    .filter((match) => match !== undefined);
  const matches = [
    ...completed,
    ...(profile.id === "self" ? recentMatches : []),
  ].sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? "", "en-US"));
  return Response.json(
    {
      ...buildPublicProfile(
        profile,
        matches,
        records.map((record) => record.match),
        profile.id === "self",
      ),
      achievements: getAchievements(profile.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
