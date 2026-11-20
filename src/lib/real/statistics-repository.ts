import { readForecastPerformance } from "./forecast-performance";
import "server-only";
import { prisma } from "../prisma";
import { getXpProgress } from "../competitive";
import { internalMetrics } from "./achievements-repository";
import { verifiedDraftorySql } from "./verified-match";
import { AccountError } from "./http";
import type { HeroCatalogEntry } from "../dota-stats/types";
export async function readDraftoryStatistics(
  actorId: string,
  handle?: string,
  db = prisma,
) {
  return db.$transaction(
    async (tx) => {
      const target = await tx.user.findFirst({
        where: handle
          ? { OR: [{ id: handle }, { profile: { publicHandle: handle } }] }
          : { id: actorId },
        select: {
          id: true,
          profile: true,
          pointWallet: { select: { balance: true } },
        },
      });
      if (
        !target?.profile ||
        (target.id !== actorId && target.profile.visibility !== "PUBLIC")
      )
        throw new AccountError("Perfil no disponible.", 404);
      const userId = target.id;
      // One transaction connection; bounded queries run sequentially, not as
      // overlapping pg.Client calls. No query-per-player or external providers.
      const metrics = await internalMetrics(tx, userId);
      const elo = await tx.$queryRaw<
        { change: number }[]
      >`SELECT h."eloChange" AS change FROM "EloHistory" h JOIN "Match" m ON m.id=h."matchId" WHERE h."userId"=${userId} AND ${verifiedDraftorySql} ORDER BY m."finishedAt" DESC,m.id DESC LIMIT 5`;
      const dates = await tx.$queryRaw<
        { date: string; count: number }[]
      >`SELECT to_char(m."finishedAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date,count(*)::int count FROM "MatchPlayer" p JOIN "Match" m ON m.id=p."matchId" WHERE p."userId"=${userId} AND ${verifiedDraftorySql} AND m."finishedAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '89 days' GROUP BY date ORDER BY date`;
      const roomCount = await tx.room.count({ where: { creatorId: userId } });
      const achievements = await tx.userAchievement.count({
        where: { userId },
      });
      const heroes = await tx.$queryRaw<
        { heroId: number; played: number; wins: number }[]
      >`
        WITH games AS (
          SELECT p."heroId" snapshot,p."teamSide" side,m."winningSide" winner,m."dotaMatchId" external,
            dl."steamId" steam,a.normalized data
          FROM "MatchPlayer" p JOIN "Match" m ON m.id=p."matchId"
          LEFT JOIN "DotaLobbyPlayer" dl ON dl."matchId"=m.id AND dl."userId"=p."userId"
          LEFT JOIN "MatchAnalyticsCache" a ON a."matchId"=m.id
          WHERE p."userId"=${userId} AND ${verifiedDraftorySql}
        ), hero_games AS (
          SELECT side,winner,CASE WHEN snapshot>0 THEN snapshot ELSE (
            SELECT max(CASE WHEN stat->>'heroId' ~ '^[1-9][0-9]{0,5}$' THEN (stat->>'heroId')::int END)
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'players')='array' THEN data->'players' ELSE '[]'::jsonb END) stat
            WHERE stat->>'accountId'=CASE WHEN steam ~ '^[0-9]{17}$' THEN (steam::numeric-76561197960265728)::text END
            AND stat->>'side'=side::text AND data->>'externalMatchId'=external AND data->'conflicts'='[]'::jsonb
            HAVING count(*)=1
          ) END AS hero FROM games
        ) SELECT hero AS "heroId",count(*)::int played,count(*) FILTER (WHERE side=winner)::int wins
          FROM hero_games WHERE hero>0 GROUP BY hero ORDER BY count(*) DESC,hero LIMIT 8`;
      const catalog = (
        await tx.dotaCatalogCache.findUnique({
          where: { provider: "OPENDOTA" },
        })
      )?.normalized as unknown as HeroCatalogEntry[] | undefined;
      return {
        forecasts: await readForecastPerformance(tx, userId),
        metrics: {
          ...metrics,
          winrate: metrics.played ? (metrics.wins / metrics.played) * 100 : 0,
        },
        elo: target.profile.elo,
        xp: target.profile.xp.toString(),
        ...getXpProgress(target.profile.xp),
        points: (target.pointWallet?.balance ?? BigInt(0)).toString(),
        recentElo: {
          count: elo.length,
          total: elo.reduce((sum, row) => sum + row.change, 0),
        },
        activity: dates,
        serverNow: new Date().toISOString(),
        roomCount,
        achievements,
        heroes: heroes.map((hero) => ({
          ...hero,
          winrate: hero.played ? (hero.wins / hero.played) * 100 : 0,
          name: Array.isArray(catalog)
            ? (catalog.find((h) => h.heroId === hero.heroId)?.name ??
              `Héroe ${hero.heroId}`)
            : `Héroe ${hero.heroId}`,
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type DraftoryStatistics = Awaited<
  ReturnType<typeof readDraftoryStatistics>
>;
