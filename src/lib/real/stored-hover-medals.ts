import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { steamAccountId } from "../auth/openid";
import { normalizeRank } from "../dota-stats/normalize";
import type { PlayerHoverProfile } from "../player-hover";

/** One bounded PostgreSQL read, shared by hover cards and clan rosters. No sync. */
export async function readStoredMedals(
  actor: string,
  ids: string[],
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
) {
  const result: Record<string, PlayerHoverProfile["medal"]> = {};
  if (!ids.length) return result;
  const rows = await db.$queryRaw<
    {
      id: string;
      steamId: string | null;
      normalized: unknown;
      status: string | null;
      stale: boolean;
      rankTier: number | null;
      state: string | null;
    }[]
  >`
 SELECT u.id,u."steamId",e.normalized,e.status,(e."expiresAt" IS NULL OR e."expiresAt"<=clock_timestamp()) stale,m."rankTier",m.state
 FROM "User" u JOIN "Profile" p ON p."userId"=u.id
 LEFT JOIN "DotaAccount" a ON a."userId"=u.id
 LEFT JOIN "ManualDotaMedal" m ON m."userId"=u.id
 LEFT JOIN "DotaExternalCache" e ON e."userId"=u.id AND e.provider='OPENDOTA' AND e.category='PROFILE'
 AND e."resourceKey"=CASE WHEN u."steamId" ~ '^[0-9]{17}$' THEN (u."steamId"::numeric-76561197960265728)::text ELSE '' END
 WHERE u.id=ANY(${ids.slice(0, 100)}::text[]) AND (p.visibility='PUBLIC' OR u.id=${actor}) AND (a.visibility IS DISTINCT FROM 'PRIVATE' OR u.id=${actor})`;
  for (const row of rows) {
    let medal: PlayerHoverProfile["medal"] = null,
      account: string | null = null;
    try {
      if (row.steamId) account = steamAccountId(row.steamId);
    } catch {}
    if (
      row.normalized &&
      typeof row.normalized === "object" &&
      ["available", "stale"].includes(row.status ?? "")
    ) {
      const data = (
        row.normalized as {
          data?: {
            accountId?: string;
            rank?: { tier?: unknown };
            leaderboardRank?: unknown;
          };
        }
      ).data;
      const rank =
        account && data?.accountId === account
          ? normalizeRank(data?.rank?.tier)
          : null;
      if (rank)
        medal = {
          name: rank.name,
          image: rank.image,
          stars: rank.stars,
          tier: rank.tier,
          stale: row.stale,
          source: "OPENDOTA_CACHE",
          leaderboardRank:
            typeof data?.leaderboardRank === "number" &&
            Number.isSafeInteger(data.leaderboardRank) &&
            data.leaderboardRank > 0
              ? data.leaderboardRank
              : null,
        };
    }
    if (
      !medal &&
      ["MANUAL_PENDING", "MANUAL_VERIFIED"].includes(row.state ?? "")
    ) {
      const rank = normalizeRank(row.rankTier);
      if (rank)
        medal = {
          name: rank.name,
          image: rank.image,
          stars: rank.stars,
          tier: rank.tier,
          stale: false,
          source: row.state as "MANUAL_PENDING" | "MANUAL_VERIFIED",
          leaderboardRank: null,
        };
    }
    result[row.id] = medal;
  }
  return result;
}
