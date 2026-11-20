import "server-only";
import { reserveProviderBudget } from "./budget";
import { randomUUID } from "node:crypto";
import type {
  PrismaClient,
  Prisma,
  DotaExternalCache,
} from "../../generated/prisma/client";
import { steamAccountId } from "../auth/openid";
import { dotaStatsConfig as config } from "./config";
import { OpenDotaError, type DotaProvider } from "./opendota";
import type {
  DotaCategory,
  DotaProviderName,
  DotaStatsDto,
  ExternalReason,
  ExternalStatus,
  NormalizedResult,
} from "./types";

type Db = Pick<PrismaClient, "user" | "dotaExternalCache" | "$transaction">;
export class DotaAccessError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}
export async function authorizeDotaAccount(
  db: Db,
  actorId: string,
  handle?: string,
) {
  const target = await db.user.findFirst({
    where: handle
      ? { OR: [{ id: handle }, { profile: { publicHandle: handle } }] }
      : { id: actorId },
    select: {
      id: true,
      steamId: true,
      profile: { select: { visibility: true } },
    },
  });
  if (
    !target?.profile ||
    (target.id !== actorId && target.profile.visibility !== "PUBLIC")
  )
    throw new DotaAccessError(404, "PROFILE_NOT_AVAILABLE");
  if (!target.steamId)
    throw new DotaAccessError(409, "DOTA_IDENTITY_NOT_AVAILABLE");
  return { userId: target.id, accountId: steamAccountId(target.steamId) };
}
export function cacheDto(
  row: DotaExternalCache | null,
  category: DotaCategory,
  now = Date.now(),
  provider: DotaProviderName = row?.provider === "STRATZ"
    ? "STRATZ"
    : "OPENDOTA",
): DotaStatsDto {
  const saved = row?.normalized as unknown as NormalizedResult | null;
  const permitted = row?.status !== "private";
  const status: ExternalStatus = !row
    ? "never_synced"
    : row.status === "private"
      ? "private"
      : saved &&
          (row.status === "stale" ||
            !row.expiresAt ||
            row.expiresAt.getTime() <= now)
        ? "stale"
        : (row.status as ExternalStatus);
  return {
    provider,
    category,
    status,
    errorReason: (row?.errorReason as ExternalReason) ?? null,
    fetchedAt: row?.fetchedAt?.toISOString() ?? null,
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    lastAttemptAt: row?.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
    syncing: !!row?.leaseUntil && row.leaseUntil.getTime() > now,
    coverage: permitted ? (saved?.coverage ?? null) : null,
    data: permitted ? (saved?.data ?? null) : null,
  };
}
function key(userId: string, category: DotaCategory, resourceKey: string) {
  return { userId, provider: config.provider, category, resourceKey };
}
export async function readDotaCache(
  db: Db,
  userId: string,
  category: DotaCategory,
  resourceKey: string,
  now = Date.now(),
) {
  return cacheDto(
    await db.dotaExternalCache.findUnique({
      where: {
        userId_provider_category_resourceKey: key(
          userId,
          category,
          resourceKey,
        ),
      },
    }),
    category,
    now,
  );
}
export async function synchronizeDota(
  db: Db,
  provider: DotaProvider,
  userId: string,
  accountId: string,
  category: DotaCategory,
  matchId?: string,
  options: { signal?: AbortSignal; now?: () => number } = {},
) {
  if (category === "MATCH") throw new OpenDotaError("INVALID_RESPONSE");
  const clock = options.now ?? Date.now,
    resourceKey = accountId,
    identity = key(userId, category, resourceKey),
    token = randomUUID(),
    now = new Date(clock());
  const leased = await db.$transaction(async (tx) => {
    await tx.dotaExternalCache.upsert({
      where: { userId_provider_category_resourceKey: identity },
      create: identity,
      update: {},
    });
    const acquired = await tx.dotaExternalCache.updateMany({
      where: {
        ...identity,
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          {
            OR: [
              { lastAttemptAt: null },
              {
                lastAttemptAt: {
                  lte: new Date(now.getTime() - config.cooldownMs),
                },
              },
            ],
          },
          { OR: [{ expiresAt: null }, { expiresAt: { lte: now } }] },
        ],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + config.leaseMs),
      },
    });
    if (!acquired.count) return false;
    const permitted = await reserveProviderBudget(tx, "OPENDOTA", now);
    if (!permitted) {
      const old = await tx.dotaExternalCache.findUniqueOrThrow({
        where: { userId_provider_category_resourceKey: identity },
      });
      await tx.dotaExternalCache.updateMany({
        where: { ...identity, leaseToken: token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          status:
            old.status === "private"
              ? "private"
              : old.normalized
                ? "stale"
                : "unavailable",
          errorReason: "RATE_LIMITED",
          lastAttemptAt: now,
          expiresAt: new Date(now.getTime() + config.cooldownMs),
        },
      });
      return false;
    }
    await tx.dotaExternalCache.updateMany({
      where: { ...identity, leaseToken: token },
      data: { lastAttemptAt: now },
    });
    return true;
  });
  if (!leased) return readDotaCache(db, userId, category, resourceKey, clock());
  try {
    const result = await provider.fetch(
        category,
        accountId,
        matchId,
        options.signal,
      ),
      finished = new Date(clock());
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 60000)
      throw new OpenDotaError("INVALID_RESPONSE");
    await db.dotaExternalCache.updateMany({
      where: { ...identity, leaseToken: token },
      data: {
        status: "available",
        errorReason: result.empty ? "NO_PUBLIC_DATA" : null,
        normalized: result as unknown as Prisma.InputJsonValue,
        fetchedAt: finished,
        lastSuccessAt: finished,
        expiresAt: new Date(
          finished.getTime() +
            (result.empty ? config.negativeTtlMs : config.ttl[category]),
        ),
        leaseToken: null,
        leaseUntil: null,
      },
    });
  } catch (error) {
    const failure =
        error instanceof OpenDotaError ? error : new OpenDotaError("API_ERROR"),
      finished = new Date(clock());
    await db.$transaction(async (tx) => {
      const old = await tx.dotaExternalCache.findUniqueOrThrow({
        where: { userId_provider_category_resourceKey: identity },
      });
      const saved = await tx.dotaExternalCache.updateMany({
        where: { ...identity, leaseToken: token },
        data: {
          status:
            old.status === "private"
              ? "private"
              : old.normalized
                ? "stale"
                : "unavailable",
          errorReason: failure.reason,
          expiresAt: new Date(
            finished.getTime() +
              Math.max(config.negativeTtlMs, failure.retryAfterMs ?? 0),
          ),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (saved.count && failure.reason === "RATE_LIMITED")
        await tx.dotaApiBudget.updateMany({
          where: {
            provider: config.provider,
            OR: [
              { blockedUntil: null },
              {
                blockedUntil: {
                  lt: new Date(
                    finished.getTime() +
                      (failure.retryAfterMs ?? config.cooldownMs),
                  ),
                },
              },
            ],
          },
          data: {
            blockedUntil: new Date(
              finished.getTime() + (failure.retryAfterMs ?? config.cooldownMs),
            ),
          },
        });
    });
  }
  return readDotaCache(db, userId, category, resourceKey, clock());
}
