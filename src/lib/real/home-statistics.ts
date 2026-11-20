import "server-only";
import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";

export async function readHomeStatistics(
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
) {
  const [row] = await db.$queryRaw<
    {
      rooms: bigint;
      connected: bigint;
      stake: bigint;
      open: bigint;
      inGame: bigint;
    }[]
  >`
    WITH active AS (
      SELECT r.id,r.phase FROM "Room" r WHERE r."closedAt" IS NULL
      AND r.phase NOT IN ('FINISHED','CANCELLED')
      AND (r.phase IN ('PREPARING','WAITING_FOR_PLAYERS','IN_GAME') OR
        EXISTS (SELECT 1 FROM "RoomMember" m WHERE m."roomId"=r.id AND m."leftAt" IS NULL))
      AND (r.phase IN ('PREPARING','WAITING_FOR_PLAYERS','IN_GAME') OR
        NOT EXISTS (SELECT 1 FROM "RoomPresenceState" s WHERE s."roomId"=r.id AND s."graceUntil"<=now()) OR
        EXISTS (SELECT 1 FROM "RoomPresenceConnection" c WHERE c."roomId"=r.id AND c."expiresAt">now()))
    ) SELECT (SELECT count(*) FROM active) rooms,
      (SELECT count(*) FROM active WHERE phase<>'IN_GAME') open,
      (SELECT count(*) FROM active WHERE phase='IN_GAME') "inGame",
      (SELECT count(DISTINCT c."userId") FROM "RoomPresenceConnection" c
        JOIN "RoomMember" m ON m."roomId"=c."roomId" AND m."userId"=c."userId"
        JOIN active a ON a.id=c."roomId" WHERE c."expiresAt">now() AND m."leftAt" IS NULL) connected,
      (SELECT coalesce(sum(p."stakePoints"),0) FROM "Prediction" p JOIN "Match" m ON m.id=p."matchId"
        WHERE p.status='PENDING' AND p."settledAt" IS NULL AND m.status IN ('QUEUED','LOBBY_SENT','IN_PROGRESS')) stake`;
  return {
    activeRooms: Number(row.rooms),
    openRooms: Number(row.open),
    inGameRooms: Number(row.inGame),
    connectedUsers: Number(row.connected),
    committedPoints: row.stake.toString(),
    updatedAt: new Date().toISOString(),
  };
}

let cached:
  | { value: Awaited<ReturnType<typeof readHomeStatistics>>; until: number }
  | undefined;
let pending: ReturnType<typeof readHomeStatistics> | undefined;
export async function cachedHomeStatistics() {
  if (cached && cached.until > Date.now()) return cached.value;
  pending ??= readHomeStatistics()
    .then((value) => {
      cached = { value, until: Date.now() + 15000 };
      return value;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
