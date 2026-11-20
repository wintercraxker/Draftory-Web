// Transaction-only primitive shared by authentication and profile/backfill.
// No singleton connection or request/session dependencies.
import type { Prisma } from "../../generated/prisma/client";
import { newDraftoryId } from "../draftory-id";
export async function identityInstalled(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
) {
  const [result] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(format('%I.%I',current_schema(),'DraftoryIdentity')) IS NOT NULL AS ready`;
  return result.ready;
}
export async function ensurePublicIdentity(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string | null> {
  if (!(await identityInstalled(tx))) return null;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const old = await tx.draftoryIdentity.findUnique({ where: { userId } });
  if (old) return old.publicId;
  for (let attempt = 0; attempt < 10; attempt++) {
    const publicId = newDraftoryId();
    const created = await tx.draftoryIdentity.createMany({
      data: [{ userId, publicId }],
      skipDuplicates: true,
    });
    if (created.count) return publicId;
  }
  throw new Error("DRAFTORY_ID_ALLOCATION_UNAVAILABLE");
}
