import { resolveDisplayAvatar } from "../display-avatar";
import { readPublicIdentity } from "./identity-repository";
import { getXpProgress } from "../competitive";
import { prisma } from "../prisma";
import { validateOnboarding } from "../auth/onboarding";
import { validateDisplayName } from "../profile-validation";
import type { DotaRole, Prisma } from "../../generated/prisma/client";
import type { DotaRoleId } from "../dota-roles";
import { AccountError, objectInput, plainText } from "./http";
import type { RealProfile } from "./types";
import { normalizeDraftoryId } from "../draftory-id";
import { readOperationalMmrs } from "./mmr-repository";
export async function readReportIdentity(publicId: unknown) {
  const id = normalizeDraftoryId(publicId);
  if (!id) return null;
  const { identityInstalled } = await import("./identity-repository");
  if (!(await identityInstalled(prisma))) return null;
  const identity = await prisma.draftoryIdentity.findUnique({
    where: { publicId: id },
    select: {
      publicId: true,
      user: {
        select: {
          displayName: true,
          avatar: true,
          customAvatarUrl: true,
          profile: { select: { userId: true } },
        },
      },
    },
  });
  return identity?.user.profile
    ? {
        publicId: identity.publicId,
        name: identity.user.displayName || "Jugador de Steam",
        avatar: resolveDisplayAvatar(identity.user),
      }
    : null;
}

const include = {
  profile: true,
  dotaAccount: true,
  pointWallet: true,
} as const;
type Account = Prisma.UserGetPayload<{ include: typeof include }>;
function dto(user: Account, publicId: string | null): RealProfile {
  const p = user.profile!;
  return {
    id: user.id,
    publicId,
    name: user.displayName || "Jugador de Steam",
    avatar: resolveDisplayAvatar(user),
    handle: /^steam-\d+$/.test(p.publicHandle) ? null : p.publicHandle,
    bio: user.bio ?? "",
    country: p.country,
    region: p.region,
    visibility: p.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    preferredRolePrimary: p.preferredRolePrimary.toLowerCase() as DotaRoleId,
    preferredRoleSecondary:
      (p.preferredRoleSecondary?.toLowerCase() as DotaRoleId) ?? null,
    elo: p.elo,
    xp: p.xp.toString(),
    level: getXpProgress(p.xp).level,
    points: user.pointWallet?.balance.toString() ?? "0",
    createdAt: user.createdAt.toISOString(),
    dota: {
      mmr: user.dotaAccount?.mmr ?? null,
      mmrSource: user.dotaAccount?.mmrSource ?? "UNVERIFIED",
      leaderboardRank: user.dotaAccount?.leaderboardRank ?? null,
      visibility: user.dotaAccount?.visibility ?? "UNKNOWN",
    },
  };
}
export async function readRealProfile(userId: string, handle?: string) {
  const user = handle
    ? await prisma.user.findFirst({
        where: { OR: [{ id: handle }, { profile: { publicHandle: handle } }] },
        include,
      })
    : await prisma.user.findUnique({ where: { id: userId }, include });
  if (!user?.profile) throw new AccountError("Perfil no disponible.", 404);
  const publicId = await readPublicIdentity(user.id);
  if (user.id !== userId && user.profile.visibility === "PRIVATE")
    return {
      projection: "PRIVATE" as const,
      id: user.id,
      name: user.displayName || "Jugador de Steam",
      avatar: resolveDisplayAvatar(user),
      publicId,
      level: getXpProgress(user.profile.xp).level,
      visibility: "PRIVATE" as const,
    };
  const result = dto(user, publicId),
    mmr = (await readOperationalMmrs([user.id])).get(user.id);
  if (mmr) {
    result.dota.mmr = mmr.value;
    result.dota.mmrSource = mmr.verified ? "STAFF_VERIFIED" : "DECLARED";
  }
  return result;
}
export async function editRealProfile(userId: string, input: unknown) {
  const value = objectInput(input, [
    "displayName",
    "bio",
    "country",
    "region",
    "preferredRolePrimary",
    "preferredRoleSecondary",
    "visibility",
  ]);
  let preferences;
  try {
    preferences = validateOnboarding(value);
  } catch (error) {
    throw new AccountError(
      error instanceof Error ? error.message : "Preferencias inválidas.",
    );
  }
  if (!["PUBLIC", "PRIVATE"].includes(String(value.visibility)))
    throw new AccountError("Privacidad inválida.");
  let displayName: string;
  try {
    displayName = validateDisplayName(value.displayName);
  } catch (error) {
    throw new AccountError(
      error instanceof Error ? error.message : "Nombre inválido.",
    );
  }
  const bio = plainText(value.bio, "Bio", 500, false);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { displayName, bio } });
    await tx.profile.update({
      where: { userId },
      data: {
        country: preferences.country,
        region: preferences.region,
        visibility: value.visibility as string,
        preferredRolePrimary:
          preferences.preferredRolePrimary.toUpperCase() as DotaRole,
        preferredRoleSecondary:
          (preferences.preferredRoleSecondary?.toUpperCase() as DotaRole) ??
          null,
      },
    });
  });
  return readRealProfile(userId);
}
