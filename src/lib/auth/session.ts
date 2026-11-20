import { getXpProgress } from "../competitive";
import { resolveDisplayAvatar } from "../display-avatar";
import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../prisma";
import { authConfig } from "./config";
import { sessionUser } from "./repository";
import type { SessionIdentity } from "./types";
import type { DotaRoleId } from "../dota-roles";
import { staffAccess } from "../real/staff-access";
import { readOwnMmr } from "../real/mmr-repository";

export async function getSessionUser() {
  return sessionUser(
    prisma,
    (await cookies()).get(authConfig.sessionCookie)?.value,
  );
}
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = user.profile;
  const mmr = await readOwnMmr(user.id);
  const access = await staffAccess(user.id).catch(() => null); // Optional menu metadata must not invalidate a verified Steam session. Staff routes still fail closed.
  return {
    id: user.id,
    staff: access
      ? {
          role: access.role,
          canAccessStaff:
            access.role !== "USER" && Boolean(profile?.onboardingCompletedAt),
        }
      : undefined,
    name: user.displayName ?? user.username,
    avatar: resolveDisplayAvatar(user),
    handle: profile?.publicHandle ?? user.username,
    onboardingRequired: !profile?.onboardingCompletedAt,
    mmrRequired:
      mmr.installed &&
      (!mmr.row || mmr.row.value === null || mmr.row.value <= 0),
    mmrVerified: !!mmr.row?.verified && (mmr.row.value ?? 0) > 0,
    points: Number(user.pointWallet?.balance ?? 0),
    player: profile
      ? {
          id: user.id,
          name: user.displayName ?? user.username,
          username: profile.publicHandle,
          avatar: resolveDisplayAvatar(user) ?? undefined,
          bio: user.bio ?? "",
          country: profile.country ?? "No especificado",
          region: profile.region ?? "No especificada",
          visibility: profile.visibility === "PRIVATE" ? "Privado" : "Público",
          preferredRolePrimary:
            profile.preferredRolePrimary.toLowerCase() as DotaRoleId,
          preferredRoleSecondary:
            profile.preferredRoleSecondary?.toLowerCase() as
              DotaRoleId | undefined,
          mmr: mmr.row?.value ?? 0,
          mmrAvailable: !!mmr.row,
          elo: profile.elo,
          level: getXpProgress(profile.xp).level,
          xp: Number(profile.xp),
        }
      : null,
  };
}
