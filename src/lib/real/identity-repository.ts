import "server-only";
import { prisma } from "../prisma";
import { normalizeDraftoryId } from "../draftory-id";
import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./http";
import { identityInstalled, ensurePublicIdentity } from "./identity-allocator";
export { identityInstalled, ensurePublicIdentity } from "./identity-allocator";
// Separate relation keeps Steam login usable before this additive migration.
// Allocate on the first authorized profile read, then preserve the ID forever.
export async function readPublicIdentity(
  userId: string,
  db = prisma,
): Promise<string | null> {
  return db.$transaction((tx) => ensurePublicIdentity(tx, userId));
}
export async function backfillPublicIdentities(db = prisma) {
  if (!(await identityInstalled(db)))
    throw new AccountError("Falta desplegar public_identity.", 503);
  let created = 0,
    existing = 0,
    cursor: string | undefined;
  for (;;) {
    const rows = await db.user.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const user of rows) {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
        const old = await tx.draftoryIdentity.findUnique({
          where: { userId: user.id },
        });
        await ensurePublicIdentity(tx, user.id);
        if (old) existing++;
        else created++;
      });
    }
    cursor = rows.at(-1)!.id;
  }
  return { created, existing };
}
export async function resolvePublicIdentity(
  value: unknown,
  tx: Prisma.TransactionClient,
) {
  const publicId = normalizeDraftoryId(value);
  if (!publicId)
    throw new AccountError(
      "Identificador de Draftory inválido. Ejemplo: DF-8K4P2X7N.",
    );
  if (!(await identityInstalled(tx)))
    throw new AccountError(
      "Reportes pendientes de habilitar. Falta aplicar la migración de identidad.",
      503,
    );
  const identity = await tx.draftoryIdentity.findUnique({
    where: { publicId },
    include: { user: { select: { profile: { select: { userId: true } } } } },
  });
  if (!identity?.user.profile)
    throw new AccountError("Jugador no disponible.", 404);
  return identity.userId;
}
