import "server-only";
import type { Prisma } from "../../generated/prisma/client";
export const FORECAST_POINTS_PER_CORRECT = 10;
// Historical free forecasts and current points forecasts share performance; reads never move funds.
export async function readForecastPerformance(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const [row] = await tx.$queryRaw<
    {
      total: number;
      won: number;
      lost: number;
      pending: number;
      voided: number;
      currentStreak: number;
    }[]
  >`
 WITH outcomes AS (
  SELECT status, sum(CASE WHEN status='LOST' THEN 1 ELSE 0 END) OVER (ORDER BY "settledAt" DESC,id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) breaks
  FROM "Prediction" WHERE "userId"=${userId} AND ("freeParticipation" OR "resolutionEvidence"->>'policy'='DRAFTORY_POINTS_V1') AND status IN ('WON','LOST')
 ) SELECT count(*)::int total,count(*) FILTER(WHERE status='WON')::int won,
 count(*) FILTER(WHERE status='LOST')::int lost,count(*) FILTER(WHERE status='PENDING')::int pending,
 count(*) FILTER(WHERE status='VOID')::int voided,
 (SELECT count(*)::int FROM outcomes WHERE status='WON' AND breaks=0) AS "currentStreak"
 FROM "Prediction" WHERE "userId"=${userId} AND ("freeParticipation" OR "resolutionEvidence"->>'policy'='DRAFTORY_POINTS_V1')`;
  return {
    ...row,
    accuracy:
      row.won + row.lost
        ? Math.round((row.won / (row.won + row.lost)) * 1000) / 10
        : null,
    score: row.won * FORECAST_POINTS_PER_CORRECT,
    pointsPerCorrect: FORECAST_POINTS_PER_CORRECT,
  };
}
export type ForecastPerformance = Awaited<
  ReturnType<typeof readForecastPerformance>
>;
