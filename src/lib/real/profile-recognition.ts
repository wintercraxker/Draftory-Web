import { configuredSponsorIds } from "../sponsor-recognition";
import "server-only";
import { prisma } from "../prisma";
import { AccountError } from "./errors";
import type { Prisma } from "../../generated/prisma/client";
import { publicSanctionReason } from "../sanction-categories";
export async function profileRecognition(
  userId: string,
  db: Pick<
    Prisma.TransactionClient,
    "user" | "staffAuthorization" | "playerSanction" | "notification"
  > = prisma,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      draftoryIdentity: { select: { publicId: true } },
      lifecycle: { select: { deletedAt: true } },
    },
  });
  if (!user || user.lifecycle?.deletedAt)
    throw new AccountError("Perfil no disponible.", 404);
  const now = new Date();
  const [grant, suspension] = await Promise.all([
    db.staffAuthorization.findUnique({
      where: { userId },
      select: { role: true, revokedAt: true },
    }),
    db.playerSanction.findFirst({
      where: {
        userId,
        state: "ACTIVE",
        kind: { in: ["SUSPENSION", "PERMANENT"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { endsAt: "desc" },
      select: { id: true, kind: true, endsAt: true },
    }),
  ]);
  const role =
    grant &&
    !grant.revokedAt &&
    ["OWNER", "ADMIN", "MODERATOR", "HELPER"].includes(grant.role)
      ? grant.role
      : "USER";
  const notice = suspension
    ? await db.notification.findUnique({
        where: { id: `sanction:${suspension.id}` },
        select: { payload: true },
      })
    : null;
  const category = (notice?.payload as Record<string, unknown> | null)
    ?.publicCategory;
  return {
    role,
    sponsor: Boolean(
      user.draftoryIdentity &&
      configuredSponsorIds().includes(user.draftoryIdentity.publicId),
    ),
    suspension: suspension
      ? {
          kind: suspension.kind,
          endsAt: suspension.endsAt?.toISOString() ?? null,
          publicSummary: publicSanctionReason(category),
        }
      : null,
    serverNow: now.toISOString(),
  };
}
