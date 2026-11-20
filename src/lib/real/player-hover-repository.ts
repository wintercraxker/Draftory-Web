import "server-only";
import { clanIdentities } from "./clan-repository";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { AccountError } from "./errors";
import { verifiedDraftorySql } from "./verified-match";
import { getXpProgress } from "../competitive";
import { dotaRoles } from "../dota-roles";
import { readStoredMedals } from "./stored-hover-medals";
import { publicTeamRoles } from "../public-team";
import { configuredSponsorIds } from "../sponsor-recognition";
import { resolveDisplayAvatar } from "../display-avatar";
import { validateSocialLinks, socialPlatforms } from "../profile-socials";
import { dotabuffUrl } from "./profile-socials";
import type { PlayerHoverProfile } from "../player-hover";
import { readOperationalMmrs } from "./mmr-repository";
export async function readPlayerHover(
  actorId: string,
  reference: string,
  db = prisma,
): Promise<PlayerHoverProfile> {
  const match = /^(id|public):([A-Za-z0-9_-]{1,100})$/.exec(reference);
  if (!match || (match[1] === "public" && !/^DF-[A-Z0-9]{8}$/.test(match[2])))
    throw new AccountError("Identidad no válida.", 400);
  return db.$transaction(
    async (tx) => {
      const [u] = await tx.$queryRaw<
        {
          id: string;
          name: string;
          avatar: string | null;
          customAvatarUrl: string | null;
          steamId: string | null;
          visibility: string;
          handle: string;
          publicId: string | null;
          elo: number;
          xp: bigint;
          role: string;
          mmr: number | null;
          mmrSource: string;
          dotaVisibility: string | null;
          socialLinks: unknown;
          staffRole: string | null;
        }[]
      >`
   SELECT u.id,COALESCE(NULLIF(u."displayName",''),'Jugador de Steam') name,u.avatar,u."customAvatarUrl",u."steamId",p.visibility,p."publicHandle" handle,d."publicId",p.elo,p.xp,p."preferredRolePrimary"::text role,p."socialLinks",sa.role AS "staffRole",a.mmr,a."mmrSource"::text,a.visibility::text AS "dotaVisibility"
   FROM "User" u JOIN "Profile" p ON p."userId"=u.id
   LEFT JOIN "DraftoryIdentity" d ON d."userId"=u.id LEFT JOIN "DotaAccount" a ON a."userId"=u.id
   LEFT JOIN "StaffAuthorization" sa ON sa."userId"=u.id AND sa."revokedAt" IS NULL
   LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id
   WHERE ${match[1] === "id" ? Prisma.sql`u.id=${match[2]}` : Prisma.sql`d."publicId"=${match[2]}`} AND l."deletedAt" IS NULL AND p."onboardingCompletedAt" IS NOT NULL`;
      if (!u || (u.id !== actorId && u.visibility !== "PUBLIC"))
        throw new AccountError("Perfil no disponible.", 404);
      const [metrics] = await tx.$queryRaw<
        {
          played: number;
          wins: number;
          losses: number;
          position: number | null;
        }[]
      >`
   WITH results AS (SELECT mp."userId",count(*)::int played,count(*) FILTER(WHERE m."winningSide"=mp."teamSide")::int wins
    FROM "MatchPlayer" mp JOIN "Match" m ON m.id=mp."matchId" WHERE ${verifiedDraftorySql} GROUP BY mp."userId"),
   ranked AS (SELECT ru.id,row_number() OVER(ORDER BY p.elo DESC,COALESCE(s.wins,0) DESC,COALESCE(s.played,0) DESC,ru."createdAt" ASC,ru.id ASC)::int position
    FROM "Profile" p JOIN "User" ru ON ru.id=p."userId" LEFT JOIN results s ON s."userId"=ru.id
    WHERE p.visibility='PUBLIC' AND p."onboardingCompletedAt" IS NOT NULL)
   SELECT COALESCE(s.played,0)::int played,COALESCE(s.wins,0)::int wins,COALESCE(s.played-s.wins,0)::int losses,
    (SELECT position FROM ranked WHERE id=${u.id}) position FROM (SELECT 1) base LEFT JOIN results s ON s."userId"=${u.id}`;
      const achievements = await tx.$queryRaw<
        {
          id: string;
          name: string;
          description: string;
          unlockedAt: Date;
          total: number;
        }[]
      >`
   SELECT d.id,d.name,d.description,a."unlockedAt",count(*) OVER()::int total FROM "UserAchievement" a JOIN "AchievementDefinition" d ON d.id=a."achievementId"
   WHERE a."userId"=${u.id} AND d.enabled=true ORDER BY a."unlockedAt" DESC,d.id ASC LIMIT 4`;
      let socialLinks: NonNullable<PlayerHoverProfile["socialLinks"]> = [];
      try {
        const links = validateSocialLinks(u.socialLinks);
        socialLinks = socialPlatforms.flatMap((platform) =>
          links[platform]
            ? [{ platform, url: links[platform]!, source: "MANUAL" as const }]
            : [],
        );
        const generated =
          u.id === actorId ? dotabuffUrl(u.steamId, null, null) : null;
        if (generated && !links.dotabuff)
          socialLinks.push({
            platform: "dotabuff",
            url: generated,
            source: "STEAM_DERIVED",
          });
      } catch {
        /* Invalid legacy metadata is never exposed. */
      }
      const medal = (await readStoredMedals(actorId, [u.id], tx))[u.id] ?? null;
      const role =
        dotaRoles.find((r) => r.id === u.role.toLowerCase())?.name ?? null;
      const avatar = resolveDisplayAvatar(u);
      const clan = (await clanIdentities(actorId, [u.id], tx))[u.id] ?? null;
      const operational = (await readOperationalMmrs([u.id], tx)).get(u.id);
      if (operational) {
        u.mmr = operational.value;
        u.mmrSource = operational.verified ? "STAFF_VERIFIED" : "DECLARED";
      }
      return {
        clan,
        identityBadges: {
          staffRole:
            u.staffRole && u.staffRole in publicTeamRoles ? u.staffRole : null,
          staff:
            u.staffRole && u.staffRole in publicTeamRoles
              ? publicTeamRoles[u.staffRole as keyof typeof publicTeamRoles]
                  .label
              : null,
          sponsor: !!u.publicId && configuredSponsorIds().includes(u.publicId),
        },
        socialLinks,
        achievementCount: achievements[0]?.total ?? 0,
        name: u.name.slice(0, 80),
        avatar: avatar && avatar.length <= 2048 ? avatar : null,
        publicId: u.publicId,
        href:
          u.id === actorId
            ? "/perfil"
            : "/profile/" + encodeURIComponent(u.handle || u.id),
        elo: u.elo,
        level: getXpProgress(u.xp).level,
        role,
        rankPosition: metrics.position,
        mmr:
          (u.id === actorId || u.dotaVisibility === "PUBLIC") &&
          u.mmrSource !== "UNVERIFIED" &&
          Number.isSafeInteger(u.mmr) &&
          u.mmr! >= 0
            ? u.mmr
            : null,
        mmrSource: ["DECLARED", "EXTERNAL", "STAFF_VERIFIED"].includes(
          u.mmrSource,
        )
          ? u.mmrSource
          : null,
        medal,
        stats: {
          played: metrics.played,
          wins: metrics.wins,
          losses: metrics.losses,
          winrate: metrics.played
            ? (metrics.wins / metrics.played) * 100
            : null,
        },
        achievements: achievements.map((a) => ({
          id: a.id,
          name: a.name.slice(0, 80),
          description: a.description.slice(0, 200),
          unlockedAt: a.unlockedAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
