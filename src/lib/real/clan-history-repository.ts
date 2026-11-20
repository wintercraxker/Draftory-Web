import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { AccountError } from "./errors";
import { clansInstalled } from "./clan-repository";
import { verifiedDraftorySql } from "./verified-match";
export type ClanHistory = {
  page: number;
  hasMore: boolean;
  statistics: {
    played: number;
    wins: number;
    losses: number;
    winRate: number | null;
  };
  records: {
    id: string;
    mode: string;
    finishedAt: string;
    side: string;
    result: "Victoria" | "Derrota";
  }[];
};
// Historical membership intervals, never today's roster or a display-name tag.
// Five frozen players must have represented the same clan on one side at preparation.
export async function readClanHistory(
  id: string,
  page = 1,
  db = prisma,
): Promise<ClanHistory> {
  if (
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw new AccountError("Clan o página no válidos.", 400);
  if (!(await clansInstalled(db)))
    throw new AccountError("El sistema de clanes no está habilitado.", 503);
  return db.$transaction(
    async (tx) => {
      if (
        !(await tx.clan.findFirst({
          where: { id, disbandedAt: null },
          select: { id: true },
        }))
      )
        throw new AccountError("Clan no disponible.", 404);
      const represented = Prisma.sql`WITH represented AS (
   SELECT m.id,m.mode,m."finishedAt",m."winningSide",min(p."teamSide"::text) side
   FROM "Match" m JOIN "MatchPlayer" p ON p."matchId"=m.id
   WHERE ${verifiedDraftorySql} AND EXISTS(
    SELECT 1 FROM "ClanMembership" cm WHERE cm."clanId"=${id}::uuid AND cm."userId"=p."userId"
    AND cm."joinedAt"<=(m."createdAt" AT TIME ZONE 'UTC')
    AND (cm."leftAt" IS NULL OR cm."leftAt">(m."createdAt" AT TIME ZONE 'UTC')))
   GROUP BY m.id HAVING count(DISTINCT p."userId")=5 AND count(DISTINCT p."teamSide")=1
  )`;
      const [stats] = await tx.$queryRaw<
        { played: number; wins: number; losses: number }[]
      >(Prisma.sql`${represented}
   SELECT count(*)::int played,count(*) FILTER(WHERE side="winningSide"::text)::int wins,
   count(*) FILTER(WHERE side<>"winningSide"::text)::int losses FROM represented`);
      const rows = await tx.$queryRaw<
        {
          id: string;
          mode: string;
          finishedAt: Date;
          side: string;
          won: boolean;
        }[]
      >(Prisma.sql`${represented}
   SELECT id,mode,"finishedAt",side,side="winningSide"::text won FROM represented
   ORDER BY "finishedAt" DESC,id DESC LIMIT 11 OFFSET ${(page - 1) * 10}`);
      return {
        page,
        hasMore: rows.length > 10,
        statistics: {
          ...stats,
          winRate: stats.played
            ? Math.round((stats.wins / stats.played) * 1000) / 10
            : null,
        },
        records: rows
          .slice(0, 10)
          .map((r) => ({
            id: r.id,
            mode: r.mode,
            finishedAt: r.finishedAt.toISOString(),
            side: r.side,
            result: r.won ? ("Victoria" as const) : ("Derrota" as const),
          })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
