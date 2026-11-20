import { configuredSponsorIds } from "../sponsor-recognition";
import "server-only";
import { createHash } from "node:crypto";
import { resolveDisplayAvatar } from "../display-avatar";
import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";
import { staffAvatar } from "../staff-avatar";
import {
  publicTeamRoles,
  type PublicTeam,
  type PublicTeamRole,
  type PublicTeamMember,
} from "../public-team";
export async function readPublicTeam(
  db: Pick<Prisma.TransactionClient, "staffAuthorization" | "user"> = prisma,
): Promise<PublicTeam> {
  const rows = await db.staffAuthorization.findMany({
    where: {
      revokedAt: null,
      role: { in: Object.keys(publicTeamRoles) },
      user: { lifecycle: { isNot: { deletedAt: { not: null } } } },
    },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatar: true,
          customAvatarUrl: true,
          profileAvatar: { select: { version: true } },
          profile: { select: { publicHandle: true, visibility: true } },
        },
      },
    },
    orderBy: { userId: "asc" },
  });
  const members = rows.map((row) => {
    const selected = resolveDisplayAvatar(row.user);
    const custom =
      row.user.customAvatarUrl &&
      row.user.profileAvatar &&
      row.user.customAvatarUrl ===
        `/api/profile/avatar/${row.user.id}/${row.user.profileAvatar.version}`;
    const avatar =
      custom && row.user.profile?.visibility === "PUBLIC"
        ? `/api/public/team/avatar/${encodeURIComponent(row.user.profile.publicHandle)}?v=${createHash("sha256").update(row.user.profileAvatar!.version).digest("hex").slice(0, 16)}`
        : staffAvatar(
            selected?.startsWith("https://") ? selected : row.user.avatar,
          );
    return {
      playerId: row.user.id,
      role: row.role as PublicTeamRole,
      name: row.user.displayName || row.user.username,
      avatar:
        avatar?.startsWith("https://") ||
        avatar?.startsWith("/api/public/team/avatar/")
          ? avatar
          : null,
      profileUrl:
        row.user.profile?.visibility === "PUBLIC"
          ? "/profile/" + encodeURIComponent(row.user.profile.publicHandle)
          : null,
    } satisfies PublicTeamMember;
  });
  const order = { OWNER: 0, ADMIN: 1, MODERATOR: 2, HELPER: 3 };
  members.sort(
    (a, b) =>
      order[a.role] - order[b.role] || a.name.localeCompare(b.name, "es"),
  );
  const ids = configuredSponsorIds();
  const sponsors = ids.length
    ? await db.user.findMany({
        where: {
          draftoryIdentity: { publicId: { in: ids } },
          lifecycle: { isNot: { deletedAt: { not: null } } },
        },
        select: {
          id: true,
          displayName: true,
          username: true,
          avatar: true,
          customAvatarUrl: true,
          profileAvatar: { select: { version: true } },
          profile: { select: { publicHandle: true, visibility: true } },
        },
        orderBy: { id: "asc" },
      })
    : [];
  const sponsorCards = sponsors.map((user) => {
    const selected = resolveDisplayAvatar(user),
      custom =
        user.customAvatarUrl &&
        user.profileAvatar &&
        user.customAvatarUrl ===
          `/api/profile/avatar/${user.id}/${user.profileAvatar.version}`;
    const avatar =
      custom && user.profile?.visibility === "PUBLIC"
        ? `/api/public/team/avatar/${encodeURIComponent(user.profile.publicHandle)}?v=${createHash("sha256").update(user.profileAvatar!.version).digest("hex").slice(0, 16)}`
        : staffAvatar(
            selected?.startsWith("https://") ? selected : user.avatar,
          );
    return {
      playerId: user.id,
      role: "SPONSOR" as const,
      name: user.displayName || user.username,
      avatar:
        avatar?.startsWith("https://") ||
        avatar?.startsWith("/api/public/team/avatar/")
          ? avatar
          : null,
      profileUrl:
        user.profile?.visibility === "PUBLIC"
          ? "/profile/" + encodeURIComponent(user.profile.publicHandle)
          : null,
    };
  });
  return {
    owner: members.find((m) => m.role === "OWNER") ?? null,
    staff: members.filter((m) => m.role !== "OWNER"),
    sponsors: sponsorCards,
  };
}

/** Fresh role/profile checks: aliases never expose or authorize a private avatar. */
export async function readPublicTeamAvatar(
  handle: string,
  db: Pick<Prisma.TransactionClient, "staffAuthorization" | "user"> = prisma,
) {
  const grant = await db.staffAuthorization.findFirst({
    where: {
      revokedAt: null,
      role: { in: Object.keys(publicTeamRoles) },
      user: {
        profile: { publicHandle: handle, visibility: "PUBLIC" },
        lifecycle: { isNot: { deletedAt: { not: null } } },
      },
    },
    select: {
      user: {
        select: {
          id: true,
          customAvatarUrl: true,
          profileAvatar: { select: { bytes: true, version: true } },
        },
      },
    },
  });
  const ids = configuredSponsorIds();
  const sponsor =
    !grant && ids.length
      ? await db.user.findFirst({
          where: {
            draftoryIdentity: { publicId: { in: ids } },
            profile: { publicHandle: handle, visibility: "PUBLIC" },
            lifecycle: { isNot: { deletedAt: { not: null } } },
          },
          select: {
            id: true,
            customAvatarUrl: true,
            profileAvatar: { select: { bytes: true, version: true } },
          },
        })
      : null;
  const user = grant?.user ?? sponsor,
    avatar = user?.profileAvatar;
  return user &&
    avatar &&
    resolveDisplayAvatar(user) ===
      `/api/profile/avatar/${user.id}/${avatar.version}`
    ? avatar
    : null;
}
