import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../prisma";
// Piggybacks the existing authenticated session refresh. No new polling loop,
// external provider or public identifier; only a per-account change token.
export async function progressRevision(userId: string, db = prisma) {
  const rows = await db.$queryRaw`SELECT p.elo,p.xp::text,w.balance::text,
    (SELECT count(*)::int FROM "MatchPlayer" mp WHERE mp."userId"=${userId}) matches,
    (SELECT max(m."verifiedAt") FROM "MatchPlayer" mp JOIN "Match" m ON m.id=mp."matchId" WHERE mp."userId"=${userId}) verified,
    (SELECT max(a."fetchedAt") FROM "MatchPlayer" mp JOIN "MatchAnalyticsCache" a ON a."matchId"=mp."matchId" WHERE mp."userId"=${userId}) analytics
    FROM "Profile" p LEFT JOIN "PointWallet" w ON w."userId"=p."userId" WHERE p."userId"=${userId}`;
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
