import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./errors";
import { productLog } from "./observability";
export async function assertParticipation(
  tx: Prisma.TransactionClient,
  userIds: string[],
  scope: "PARTICIPATION" | "CHAT" = "PARTICIPATION",
) {
  // During staged deployment the old database has no sanctions at all. Do not
  // break its competitive flow. Once the table exists, enforcement is mandatory
  // and failures are fail-closed; there is no toggle that bypasses an active ban.
  const [schema] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('"PlayerSanction"') IS NOT NULL AS ready`;
  if (!schema.ready) return;
  const ids = [...new Set(userIds)].sort();
  // Same user lock as manual suspension: no check/write race.
  for (const id of ids)
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
  const now = new Date();
  const sanction = await tx.playerSanction.findFirst({
    where: {
      userId: { in: ids },
      state: "ACTIVE",
      kind: {
        in:
          scope === "CHAT"
            ? ["MUTE", "SUSPENSION", "PERMANENT"]
            : ["SUSPENSION", "PERMANENT"],
      },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  });
  if (sanction) {
    productLog("sanction", {
      status: "BLOCKED",
      reason: "ACTIVE_COMPETITIVE_SUSPENSION",
    });
    throw new AccountError(
      "Cuenta suspendida: no puede iniciar una nueva participación competitiva.",
      403,
    );
  }
}
