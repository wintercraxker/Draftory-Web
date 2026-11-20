import "server-only";
import { productLog } from "../real/observability";
import { publicAvailability } from "./availability";
import { StratzProvider } from "./stratz";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { readDotaCache, cacheDto, authorizeDotaAccount } from "./cache";
import { reserveProviderBudget } from "./budget";
import { OpenDotaError, OpenDotaProvider, type DotaProvider } from "./opendota";
import type {
  DotaCategory,
  DotaProfileBundle,
  ManualSyncStatus,
  NormalizedResult,
  HeroCatalogEntry,
} from "./types";

export const weeklySyncMs = 7 * 86400000;
const essentials = ["PROFILE", "WINLOSS", "HEROES", "PLAYER_STATS"] as const;
type Db = PrismaClient;
export function manualStatus(
  row: {
    lastSuccessfulManualSyncAt: Date | null;
    retryAfter: Date | null;
    leaseUntil: Date | null;
    outcome: string | null;
    report?: unknown;
  } | null,
  now: number,
): ManualSyncStatus {
  const report = row?.report as
    { initialQueuedAt?: unknown } | null | undefined;
  const queued =
    typeof report?.initialQueuedAt === "string"
      ? Date.parse(report.initialQueuedAt)
      : NaN;
  const initialPending =
    !row?.outcome && Number.isFinite(queued) && now < queued + 120000;
  const syncing =
    initialPending || (!!row?.leaseUntil && row.leaseUntil.getTime() > now);
  const weekly = row?.lastSuccessfulManualSyncAt
    ? row.lastSuccessfulManualSyncAt.getTime() + weeklySyncMs
    : 0;
  const until = Math.max(weekly, row?.retryAfter?.getTime() ?? 0),
    remaining = until - now;
  const days = Math.floor(remaining / 86400000);
  const wait =
    days >= 2
      ? `Disponible en ${days} días`
      : days >= 1
        ? "Disponible mañana"
        : "Disponible hoy";
  const label = syncing
    ? "Sincronizando…"
    : remaining > 0
      ? `${weekly > now ? "Perfil sincronizado" : row?.outcome === "PARTIAL_SUCCESS" ? "Sincronización parcial" : "No se pudo sincronizar"} · ${wait}`
      : "Sincronizar perfil";
  return {
    initialPending,
    interrupted:
      !row?.outcome &&
      ((!!row?.leaseUntil && row.leaseUntil.getTime() <= now) ||
        (Number.isFinite(queued) && !initialPending)),
    lastSuccessfulSyncAt:
      row?.lastSuccessfulManualSyncAt?.toISOString() ?? null,
    nextSyncAt: until > now ? new Date(until).toISOString() : null,
    syncing,
    available: !syncing && remaining <= 0,
    label,
    outcome: (row?.outcome as ManualSyncStatus["outcome"]) ?? null,
  };
}
async function dbNow(db: Pick<Db, "$queryRaw">) {
  return (
    await db.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`
  )[0].now;
}
export async function syncHeroCatalog(
  db: Db,
  fetcher: () => Promise<HeroCatalogEntry[]>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('draftory-hero-catalog'))::text`;
      const now = await dbNow(tx),
        old = await tx.dotaCatalogCache.findUnique({
          where: { provider: "OPENDOTA" },
        });
      if (old && old.expiresAt > now)
        return { requests: 0, cacheHit: true, reason: null };
      if (!(await reserveProviderBudget(tx, "OPENDOTA", now)))
        return { requests: 0, cacheHit: false, reason: "RATE_LIMITED" };
      try {
        const catalog = await fetcher();
        if (Buffer.byteLength(JSON.stringify(catalog)) > 60000)
          throw new OpenDotaError("INVALID_RESPONSE");
        const data = {
          normalized: catalog,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
        };
        await tx.dotaCatalogCache.upsert({
          where: { provider: "OPENDOTA" },
          create: { provider: "OPENDOTA", ...data },
          update: data,
        });
        return { requests: 1, cacheHit: false, reason: null };
      } catch (error) {
        const reason =
          error instanceof OpenDotaError ? error.reason : "API_ERROR";
        if (reason === "RATE_LIMITED")
          await tx.dotaApiBudget.update({
            where: { provider: "OPENDOTA" },
            data: {
              blockedUntil: new Date(
                now.getTime() +
                  Math.max(
                    60000,
                    error instanceof OpenDotaError
                      ? (error.retryAfterMs ?? 300000)
                      : 300000,
                  ),
              ),
            },
          });
        return { requests: 1, cacheHit: false, reason }; // Keep old snapshot and charged budget.
      }
    },
    { timeout: 20000 },
  );
}
export async function readProfileBundle(
  db: Db,
  actorId: string,
  handle?: string,
): Promise<DotaProfileBundle> {
  const target = await authorizeDotaAccount(db, actorId, handle),
    now = await dbNow(db);
  const [profile, winloss, heroes, performance, positionsRow, catalog, manual] =
    await Promise.all([
      readDotaCache(
        db,
        target.userId,
        "PROFILE",
        target.accountId,
        now.getTime(),
      ),
      readDotaCache(
        db,
        target.userId,
        "WINLOSS",
        target.accountId,
        now.getTime(),
      ),
      readDotaCache(
        db,
        target.userId,
        "HEROES",
        target.accountId,
        now.getTime(),
      ),
      readDotaCache(
        db,
        target.userId,
        "PLAYER_STATS",
        target.accountId,
        now.getTime(),
      ),
      db.dotaExternalCache.findUnique({
        where: {
          userId_provider_category_resourceKey: {
            userId: target.userId,
            provider: "STRATZ",
            category: "POSITIONS",
            resourceKey: target.accountId,
          },
        },
      }),
      db.dotaCatalogCache.findUnique({ where: { provider: "OPENDOTA" } }),
      db.dotaManualSync.findUnique({ where: { userId: target.userId } }),
    ]);
  const account = await db.dotaAccount.findUnique({
    where: { userId: target.userId },
    select: { steamVisibility: true },
  });
  const analytics = cacheDto(
    await db.dotaExternalCache.findUnique({
      where: {
        userId_provider_category_resourceKey: {
          userId: target.userId,
          provider: "STRATZ",
          category: "ANALYTICS",
          resourceKey: target.accountId,
        },
      },
    }),
    "ANALYTICS",
    now.getTime(),
    "STRATZ",
  );
  const availability = publicAvailability(
    profile,
    winloss,
    account?.steamVisibility ?? null,
    analytics,
  );
  // Public readers get stored data only. No calls to either provider here.
  return {
    availability,
    privacyEvidence:
      availability === "PUBLIC_DATA_NOT_SHARED"
        ? analytics.status === "available" &&
          analytics.data &&
          "isStratzPublic" in analytics.data &&
          analytics.data.isStratzPublic === false
          ? "STRATZ_PROFILE_NOT_PUBLIC"
          : null
        : null,
    analytics,
    profile,
    winloss,
    heroes,
    performance,
    positions: cacheDto(positionsRow, "POSITIONS", now.getTime(), "STRATZ"),
    catalog: (catalog?.normalized as unknown as HeroCatalogEntry[]) ?? [],
    manualSync:
      target.userId === actorId
        ? manualStatus(manual, now.getTime())
        : { syncing: false, available: false, label: "", outcome: null },
  };
}

export async function syncDotaProfile(
  db: Db,
  userId: string,
  requestId: string,
  provider: DotaProvider = new OpenDotaProvider(),
  catalogFetcher?: () => Promise<HeroCatalogEntry[]>,
  initial = false,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new Error("INVALID_REQUEST_ID");
  const target = await authorizeDotaAccount(db, userId),
    token = randomUUID();
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"manual-dota-sync:" + userId}, 0))::text`;
    const now = await dbNow(tx);
    await tx.dotaManualSync.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await tx.$queryRaw`SELECT "userId" FROM "DotaManualSync" WHERE "userId"=${userId} FOR UPDATE`;
    const old = await tx.dotaManualSync.findUniqueOrThrow({
      where: { userId },
    });
    // One initial preparation, including failed/interrupted attempts. The durable
    // requestId is written with the lease before contacting a provider.
    if (
      initial &&
      (old.requestId !== null ||
        old.outcome !== null ||
        (await tx.dotaExternalCache.findFirst({
          where: { userId, lastSuccessAt: { not: null } },
          select: { userId: true },
        })))
    )
      return false;
    if (
      old.requestId === requestId ||
      (!manualStatus(old, now.getTime()).available &&
        !(initial && manualStatus(old, now.getTime()).initialPending))
    )
      return false;
    await tx.dotaManualSync.update({
      where: { userId },
      data: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 120000),
        requestId,
      },
    });
    return true;
  });
  if (!claimed) return readProfileBundle(db, userId);
  const metrics = {
    requests: { OPENDOTA: 0, STRATZ: 0 },
    cacheHits: 0,
    updated: [] as string[],
    failures: [] as { category: string; reason: string }[],
  };
  let essentialCacheHits = 0;
  const results = new Map<DotaCategory, NormalizedResult>();
  // Sequential small operations. No massive history, no parsing, no shadow reads.
  for (const category of essentials) {
    const cached = await readDotaCache(db, userId, category, target.accountId);
    if (
      cached.status === "available" &&
      cached.data &&
      cached.errorReason !== "NO_PUBLIC_DATA"
    ) {
      metrics.cacheHits++;
      essentialCacheHits++;
      continue;
    }
    const allowed = await db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const owns = await tx.dotaManualSync.findFirst({
        where: { userId, leaseToken: token, leaseUntil: { gt: now } },
      });
      return !!owns && reserveProviderBudget(tx, "OPENDOTA", now);
    });
    if (!allowed) {
      metrics.failures.push({ category, reason: "RATE_LIMITED" });
      continue;
    }
    metrics.requests.OPENDOTA++;
    try {
      const result = await provider.fetch(category, target.accountId);
      if (Buffer.byteLength(JSON.stringify(result)) > 60000)
        throw new OpenDotaError("INVALID_RESPONSE");
      results.set(category, result);
      if (!result.empty) metrics.updated.push(category);
      else metrics.failures.push({ category, reason: "NO_PUBLIC_DATA" });
    } catch (error) {
      const reason =
        error instanceof OpenDotaError ? error.reason : "API_ERROR";
      metrics.failures.push({ category, reason });
      if (reason === "RATE_LIMITED") {
        const delay =
          error instanceof OpenDotaError
            ? Math.max(60000, error.retryAfterMs ?? 300000)
            : 300000;
        await db.$transaction(async (tx) => {
          const now = await dbNow(tx);
          await tx.dotaApiBudget.update({
            where: { provider: "OPENDOTA" },
            data: { blockedUntil: new Date(now.getTime() + delay) },
          });
        });
        break; // Do not turn a 429 into a burst of other requests.
      }
    }
  }
  // Catalog is a single global snapshot; lock serializes refresh across users.
  if (catalogFetcher) {
    const catalog = await syncHeroCatalog(db, catalogFetcher);
    metrics.requests.OPENDOTA += catalog.requests;
    if (catalog.cacheHit) metrics.cacheHits++;
    if (catalog.reason)
      metrics.failures.push({ category: "CATALOG", reason: catalog.reason });
  }
  let analyticsResult: NormalizedResult | null = null,
    analyticsFailure: string | null = null;
  const analyticsKey = {
    userId,
    provider: "STRATZ",
    category: "ANALYTICS",
    resourceKey: target.accountId,
  };
  if (
    process.env.DRAFTORY_ENABLE_STRATZ === "true" &&
    process.env.STRATZ_TOKEN?.trim()
  ) {
    const old = await db.dotaExternalCache.findUnique({
      where: { userId_provider_category_resourceKey: analyticsKey },
    });
    if (old?.expiresAt && old.expiresAt > new Date()) metrics.cacheHits++;
    else {
      const permitted = await db.$transaction(async (tx) => {
        const now = await dbNow(tx);
        const owns = await tx.dotaManualSync.findFirst({
          where: { userId, leaseToken: token, leaseUntil: { gt: now } },
        });
        return !!owns && reserveProviderBudget(tx, "STRATZ", now);
      });
      if (!permitted) analyticsFailure = "RATE_LIMITED";
      else {
        metrics.requests.STRATZ++;
        productLog("provider", {
          requestId,
          provider: "STRATZ",
          status: "REQUESTED",
        });
        try {
          analyticsResult = await new StratzProvider().fetch(
            "ANALYTICS",
            target.accountId,
          );
        } catch (error) {
          analyticsFailure =
            error instanceof OpenDotaError ? error.reason : "API_ERROR";
          productLog("provider", {
            requestId,
            provider: "STRATZ",
            status: "FAILED",
            reason: analyticsFailure,
          });
          if (analyticsFailure === "RATE_LIMITED")
            await db.$transaction(async (tx) => {
              const now = await dbNow(tx);
              await tx.dotaApiBudget.update({
                where: { provider: "STRATZ" },
                data: {
                  blockedUntil: new Date(
                    now.getTime() +
                      Math.max(
                        60000,
                        error instanceof OpenDotaError
                          ? (error.retryAfterMs ?? 300000)
                          : 300000,
                      ),
                  ),
                },
              });
            });
        }
      }
    }
  }
  await db.$transaction(async (tx) => {
    const now = await dbNow(tx);
    await tx.$queryRaw`SELECT "userId" FROM "DotaManualSync" WHERE "userId"=${userId} FOR UPDATE`;
    const owned = await tx.dotaManualSync.findFirst({
      where: { userId, leaseToken: token, leaseUntil: { gt: now } },
    });
    if (!owned) return; // Expired/replaced attempts cannot publish snapshots or cooldown.
    for (const category of essentials) {
      const identity = {
          userId,
          provider: "OPENDOTA",
          category,
          resourceKey: target.accountId,
        },
        result = results.get(category);
      if (result && !result.empty) {
        const data = {
          normalized: {
            ...result,
            provenance: {
              provider: "OPENDOTA",
              version: 1,
              fetchedAt: now.toISOString(),
            },
          } as unknown as Prisma.InputJsonValue,
          status: "available",
          errorReason: null,
          fetchedAt: now,
          lastSuccessAt: now,
          lastAttemptAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
        };
        await tx.dotaExternalCache.upsert({
          where: { userId_provider_category_resourceKey: identity },
          create: { ...identity, ...data },
          update: data,
        });
      } else if (metrics.failures.some((f) => f.category === category)) {
        const old = await tx.dotaExternalCache.findUnique({
          where: { userId_provider_category_resourceKey: identity },
        });
        const data = {
          status:
            old?.status === "private"
              ? "private"
              : old?.normalized
                ? "stale"
                : "unavailable",
          errorReason: metrics.failures.find((f) => f.category === category)!
            .reason,
          lastAttemptAt: now,
        };
        await tx.dotaExternalCache.upsert({
          where: { userId_provider_category_resourceKey: identity },
          create: { ...identity, ...data },
          update: data,
        });
      }
    }
    if (analyticsResult || analyticsFailure) {
      const old = await tx.dotaExternalCache.findUnique({
        where: { userId_provider_category_resourceKey: analyticsKey },
      });
      const data = analyticsResult
        ? {
            normalized: {
              ...analyticsResult,
              provenance: {
                provider: "STRATZ",
                version: 1,
                fetchedAt: now.toISOString(),
              },
            } as unknown as Prisma.InputJsonValue,
            status: "available",
            errorReason: null,
            lastAttemptAt: now,
            lastSuccessAt: now,
            fetchedAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
          }
        : {
            status: old?.normalized ? "stale" : "unavailable",
            errorReason: analyticsFailure,
            lastAttemptAt: now,
            expiresAt: new Date(now.getTime() + 15 * 60000),
          };
      await tx.dotaExternalCache.upsert({
        where: { userId_provider_category_resourceKey: analyticsKey },
        create: { ...analyticsKey, ...data },
        update: data,
      });
    }
    // Five-position aggregates still lack a verified query/definition. Do not
    // relabel CORE/LIGHT_SUPPORT/HARD_SUPPORT as positions 1–5.
    const st = {
      userId,
      provider: "STRATZ",
      category: "POSITIONS",
      resourceKey: target.accountId,
    };
    await tx.dotaExternalCache.upsert({
      where: { userId_provider_category_resourceKey: st },
      create: { ...st, status: "unavailable", errorReason: "API_ERROR" },
      update: {},
    });
    const useful = metrics.updated.length + essentialCacheHits; // Global catalog alone is not player data.
    const complete =
      essentials.every(
        (c) => !metrics.failures.some((f) => f.category === c),
      ) &&
      essentials.every(
        (c) => results.get(c)?.empty === false || !results.has(c),
      );
    const outcome = complete
      ? "SUCCESS"
      : useful > 0
        ? "PARTIAL_SUCCESS"
        : "TOTAL_FAILURE";
    await tx.dotaManualSync.update({
      where: { userId },
      data: {
        leaseToken: null,
        leaseUntil: null,
        outcome,
        report: metrics,
        ...(outcome === "SUCCESS"
          ? { lastSuccessfulManualSyncAt: now, retryAfter: null }
          : {
              retryAfter: new Date(
                now.getTime() +
                  (outcome === "PARTIAL_SUCCESS" ? 86400000 : 15 * 60000),
              ),
            }),
      },
    });
  });
  return readProfileBundle(db, userId);
}
