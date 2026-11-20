import "server-only";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { DotaProvider } from "./opendota";
import { randomUUID } from "node:crypto";
import { syncDotaProfile } from "./sync";
import { fetchHeroCatalog } from "./catalog";
import { dotaStatsEnabled } from "./config";
export async function prepareInitialDotaProfile(
  db: PrismaClient,
  userId: string,
  provider?: DotaProvider,
  catalog = fetchHeroCatalog,
) {
  if (!dotaStatsEnabled()) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      steamId: true,
      profile: { select: { onboardingCompletedAt: true } },
    },
  });
  if (!user?.steamId || !user.profile?.onboardingCompletedAt) return;
  return syncDotaProfile(db, userId, randomUUID(), provider, catalog, true);
}

// Queue metadata is committed with onboarding, before the after() task runs.
// The existing report JSON and sync lease remain the single persistent system.
export async function queueInitialDotaProfile(
  db: Prisma.TransactionClient,
  userId: string,
) {
  if (!dotaStatsEnabled()) return;
  await db.dotaManualSync.upsert({
    where: { userId },
    create: { userId, report: { initialQueuedAt: new Date().toISOString() } },
    update: {},
  });
}
