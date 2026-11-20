import type { Prisma } from "@/generated/prisma/client";
import { AccountError } from "../real/errors";
import { terminalRoomPhases } from "./ownership";

// All web admissions lock User, including bench/captains. Room actions already
// hold their Room lock; transfer uses SKIP LOCKED to avoid reversing that order.
export async function assertSingleRoom(
  tx: Prisma.TransactionClient,
  userId: string,
  action: "create" | "join",
  roomId?: string,
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const other = await tx.room.findFirst({
    where: {
      phase: { notIn: [...terminalRoomPhases] },
      ...(roomId ? { id: { not: roomId } } : {}),
      OR: [
        { creatorId: userId },
        { members: { some: { userId, leftAt: null } } },
      ],
    },
    select: { id: true },
  });
  if (other)
    throw new AccountError(
      action === "create"
        ? "Ya estás participando en una sala. Debes salir de ella antes de crear otra"
        : "Ya estás participando en otra sala. Debes salir de ella antes de unirte",
      409,
    );
}
