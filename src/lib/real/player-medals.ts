import type { Prisma } from "../../generated/prisma/client";
import { steamAccountId } from "../auth/openid";
import { cacheDto } from "../dota-stats/cache";
import { normalizeRank } from "../dota-stats/normalize";
import type { DotaProfileData } from "../dota-stats/types";

// Batch/cache-only projection. No provider call, sync or lease acquisition.
export async function readPlayerMedals(
  tx: Prisma.TransactionClient,
  ids: string[],
  viewerId: string,
) {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      steamId: true,
      profile: { select: { visibility: true } },
    },
  });
  const rows = await tx.dotaExternalCache.findMany({
    where: {
      userId: {
        in: users
          .filter(
            (u) => u.id === viewerId || u.profile?.visibility === "PUBLIC",
          )
          .map((u) => u.id),
      },
      provider: "OPENDOTA",
      category: "PROFILE",
    },
  });
  const now = Date.now();
  // Ask PostgreSQL for expiry: adapter-pg's timestamptz offset conversion must
  // not make a local-zone snapshot look five hours newer in the main app pool.
  const expiry = await tx.$queryRawUnsafe<
    { userId: string; resourceKey: string; expired: boolean }[]
  >(
    `SELECT "userId","resourceKey",("expiresAt" IS NULL OR "expiresAt"<=now()) AS expired FROM "DotaExternalCache" WHERE provider='OPENDOTA' AND category='PROFILE' AND "userId"=ANY($1::text[])`,
    users.map((u) => u.id),
  );
  const expired = new Map(
    expiry.map((r) => [r.userId + ":" + r.resourceKey, r.expired]),
  );
  return new Map(
    users.map((u) => {
      let account: string | null = null;
      try {
        if (u.steamId) account = steamAccountId(u.steamId);
      } catch {}
      const row = rows.find(
        (r) => r.userId === u.id && r.resourceKey === account,
      );
      const cached = cacheDto(
          row
            ? {
                ...row,
                expiresAt: new Date(
                  expired.get(row.userId + ":" + row.resourceKey) !== false
                    ? 0
                    : now + 1,
                ),
              }
            : null,
          "PROFILE",
          now,
        ),
        data = cached.data as DotaProfileData | null;
      const rank =
        data?.accountId === account ? normalizeRank(data?.rank?.tier) : null;
      const position = data?.leaderboardRank;
      return [
        u.id,
        {
          dotaRankTier: rank?.tier ?? null,
          dotaRankStale: !!rank && cached.status === "stale",
          leaderboardRank:
            rank?.tier === 80 &&
            typeof position === "number" &&
            Number.isSafeInteger(position) &&
            position > 0
              ? position
              : undefined,
        },
      ] as const;
    }),
  );
}
