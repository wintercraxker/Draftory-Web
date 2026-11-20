import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newRoomPublicId() {
  return (
    "ROOM-" +
    Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(
      "",
    )
  );
}
export function normalizeRoomPublicId(value: unknown) {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^ROOM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(id) ? id : null;
}
export async function roomIdentityInstalled(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
) {
  const [r] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(format('%I.%I',current_schema(),'RoomIdentity')) IS NOT NULL AS ready`;
  return r.ready;
}
export async function ensureRoomIdentity(
  tx: Prisma.TransactionClient,
  roomId: string,
) {
  if (!(await roomIdentityInstalled(tx))) return null;
  await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE`;
  const old = await tx.roomIdentity.findUnique({ where: { roomId } });
  if (old) return old.publicId;
  for (let i = 0; i < 10; i++) {
    const publicId = newRoomPublicId();
    if (
      (
        await tx.roomIdentity.createMany({
          data: [{ roomId, publicId }],
          skipDuplicates: true,
        })
      ).count
    )
      return publicId;
  }
  throw Error("ROOM_ID_ALLOCATION_UNAVAILABLE");
}
export async function backfillRoomIdentities(db: PrismaClient) {
  if (!(await roomIdentityInstalled(db)))
    throw Error("Room identity migration required");
  let created = 0,
    existing = 0,
    cursor: string | undefined;
  for (;;) {
    const rows = await db.room.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const room of rows)
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${room.id} FOR UPDATE`;
        const old = await tx.roomIdentity.findUnique({
          where: { roomId: room.id },
        });
        await ensureRoomIdentity(tx, room.id);
        if (old) existing++;
        else created++;
      });
    cursor = rows.at(-1)!.id;
  }
  return { created, existing };
}
