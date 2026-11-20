import "server-only";
import { prisma } from "../prisma";
import { resolveDisplayAvatar } from "../display-avatar";
import { AccountError } from "./http";
import type { RankedPlayer } from "../classification-data";
import { verifiedDraftorySql } from "./verified-match";
import { getXpProgress } from "../competitive";
export type RankingEntry = RankedPlayer & {
  position: number;
  winrate: number;
  losses: number;
  forecastWins: number;
};
export type RankingPage = {
  podium: RankingEntry[];
  rows: RankingEntry[];
  currentUser: RankingEntry | null;
  total: number;
  page: number;
  pageSize: number;
};
type RawEntry = Omit<RankingEntry, "xp"> & { xp: string } & {
  customAvatarUrl: string | null;
};
export async function readRanking(
  userId: string,
  query = "",
  page = 1,
  db = prisma,
): Promise<RankingPage> {
  if (
    typeof query !== "string" ||
    query.length > 80 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000
  )
    throw new AccountError("Búsqueda inválida.");
  const pattern = "%" + query.trim().replace(/[\\%_]/g, "\\$&") + "%",
    pageSize = 25,
    offset = (page - 1) * pageSize;
  const [data] = await db.$queryRaw<
    {
      podium: RawEntry[];
      rows: RawEntry[];
      currentUser: RawEntry | null;
      total: number;
    }[]
  >`
    WITH results AS (
      SELECT mp."userId", count(*)::int played, count(*) FILTER (WHERE m."winningSide"=mp."teamSide")::int wins
      FROM "MatchPlayer" mp JOIN "Match" m ON m.id=mp."matchId"
      WHERE ${verifiedDraftorySql} GROUP BY mp."userId"
    ), ranked AS (
      SELECT u.id,COALESCE(NULLIF(u."displayName",''),'Jugador de Steam') name,u.avatar,u."customAvatarUrl",COALESCE(p.country,'No especificado') country,
        (SELECT count(*)::int FROM "Prediction" forecast WHERE forecast."userId"=u.id AND (forecast."freeParticipation" OR forecast."resolutionEvidence"->>'policy'='DRAFTORY_POINTS_V1') AND forecast.status='WON') "forecastWins",
        lower(p."preferredRolePrimary"::text) role,p.elo,p.level,p.xp::text xp,0 mmr,
        COALESCE(s.played,0) played,COALESCE(s.wins,0) wins,COALESCE(s.played-s.wins,0) losses,
        CASE WHEN s.played>0 THEN s.wins::double precision/s.played*100 ELSE 0 END winrate,
        row_number() OVER (ORDER BY p.elo DESC,COALESCE(s.wins,0) DESC,COALESCE(s.played,0) DESC,u."createdAt" ASC,u.id ASC)::int position
      FROM "Profile" p JOIN "User" u ON u.id=p."userId" LEFT JOIN results s ON s."userId"=u.id
      WHERE p.visibility='PUBLIC' AND p."onboardingCompletedAt" IS NOT NULL
    ), filtered AS (SELECT * FROM ranked WHERE name ILIKE ${pattern} OR country ILIKE ${pattern})
    SELECT COALESCE((SELECT jsonb_agg(t ORDER BY t.position) FROM (SELECT * FROM ranked ORDER BY position LIMIT 3)t),'[]'::jsonb) podium,
      COALESCE((SELECT jsonb_agg(t ORDER BY t.position) FROM (SELECT * FROM filtered ORDER BY position LIMIT ${pageSize} OFFSET ${offset})t),'[]'::jsonb) rows,
      (SELECT to_jsonb(t) FROM ranked t WHERE id=${userId}) "currentUser",(SELECT count(*)::int FROM filtered) total`;
  const entry = (r: RawEntry): RankingEntry => {
    const { customAvatarUrl, ...value } = r;
    return {
      ...value,
      xp: Number(r.xp),
      level: getXpProgress(BigInt(r.xp)).level,
      avatar:
        resolveDisplayAvatar({ customAvatarUrl, avatar: r.avatar }) ??
        undefined,
    };
  };
  return {
    podium: data.podium.map(entry),
    rows: data.rows.map(entry),
    currentUser: data.currentUser ? entry(data.currentUser) : null,
    total: data.total,
    page,
    pageSize,
  };
}
