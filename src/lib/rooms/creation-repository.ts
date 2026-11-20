import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { ensureRoomIdentity } from "../real/room-identity";
import { assertParticipation } from "../real/suspension";
import { assertSingleRoom } from "./participation-repository";
import { assertCompetitiveMmr } from "../real/mmr-repository";

type NewRoom = Pick<
  Prisma.RoomUncheckedCreateInput,
  | "name"
  | "formation"
  | "firstPickMethod"
  | "mode"
  | "region"
  | "isPrivate"
  | "passwordHash"
>;

// Production boundary; creatorId comes from the authenticated server session.
// The historical export name is retained; duplicate creation now rejects rather
// than treating an existing participation as a request to create another room.
export async function createRoomOrGetActive(
  db: PrismaClient,
  creatorId: string,
  input: NewRoom,
) {
  return db.$transaction(
    async (transaction) => {
      // Lock an existing creator row, even when no Room exists yet. Concurrent
      // requests for the same account serialize across PostgreSQL connections.
      const user = await transaction.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${creatorId} FOR UPDATE`;
      if (!user.length) throw new Error("Cuenta no disponible.");
      await assertSingleRoom(transaction, creatorId, "create");
      await assertParticipation(transaction, [creatorId]);
      await assertCompetitiveMmr(transaction, [creatorId]);
      const profile = await transaction.profile.findUnique({
        where: { userId: creatorId },
      });
      if (!profile)
        throw new Error("Configura tu perfil antes de crear una sala.");
      const room = await transaction.room.create({
        data: {
          creatorId,
          name: input.name,
          formation: input.formation,
          firstPickMethod: input.firstPickMethod,
          mode: input.mode,
          region: input.region,
          isPrivate: input.isPrivate,
          passwordHash: input.passwordHash,
          phase: "WAITING",
          members: {
            create: {
              userId: creatorId,
              roomRole: profile.preferredRolePrimary,
              team: "BENCH",
            },
          },
        },
      });
      await ensureRoomIdentity(transaction, room.id);
      return { room, existing: false };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
