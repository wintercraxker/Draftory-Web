import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { AccountError } from "./errors";
import {
  fetchMatchAnalytics,
  fetchMatchSources,
} from "../dota-stats/match-providers";
import {
  isMatchAnalytics,
  type MatchAnalytics,
} from "../dota-stats/match-analytics";
import { reserveProviderBudget } from "../dota-stats/budget";
import { OpenDotaError } from "../dota-stats/opendota";
import { steamAccountId } from "../auth/openid";
import { poorerSnapshot } from "../dota-stats/match-display";
import {
  normalizeValveStyle,
  selectMatchSnapshot,
} from "../dota-stats/match-fallbacks";
import { productLog } from "./observability";

async function nowSql(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
) {
  // Technical timestamptz reads must use UTC with adapter-pg 7.9.1. This
  // transaction-local setting never changes the auth/competition connection.
  await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
  return (
    await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`
  )[0].now;
}
export type GcMatchEvidence = {
  type: "lobbyObserved";
  lobbyId: string;
  correlationId: string;
  workerId: string;
  matchId: string;
  observedAt: Date;
};
// Trusted server GC consumer only. No public route can call this operation.
// Phase D is paused; callers must supply an actual correlated GC observation.
export async function recordGcMatchLink(
  db: PrismaClient,
  matchId: string,
  e: GcMatchEvidence,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
    const now = await nowSql(tx),
      m = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: { dotaLobby: true },
      }),
      l = m.dotaLobby;
    if (
      e.type !== "lobbyObserved" ||
      !m.roomId ||
      !l?.gcConfirmedAt ||
      l.lobbyId !== e.lobbyId ||
      l.correlationId !== e.correlationId ||
      l.workerId !== e.workerId ||
      !/^[1-9]\d{0,19}$/.test(e.matchId)
    )
      throw new AccountError("Vínculo GC no verificable.", 409);
    if (m.dotaMatchId && m.dotaMatchId !== e.matchId)
      throw new AccountError("La partida ya tiene otro vínculo.", 409);
    const old = await tx.matchExternalLink.findUnique({ where: { matchId } });
    if (old) {
      if (
        old.dotaMatchId !== e.matchId ||
        old.lobbyId !== e.lobbyId ||
        old.correlationId !== e.correlationId
      )
        throw new AccountError("Evidencia incompatible.", 409);
      return old;
    }
    if (
      l.state !== "CONFIRMED" ||
      !Number.isFinite(e.observedAt.getTime()) ||
      e.observedAt < l.gcConfirmedAt ||
      now.getTime() - e.observedAt.getTime() > 30000 ||
      e.observedAt.getTime() > now.getTime() + 1000
    )
      throw new AccountError("Observación GC no vigente.", 409);
    const link = await tx.matchExternalLink.create({
      data: {
        matchId,
        dotaMatchId: e.matchId,
        lobbyId: e.lobbyId,
        correlationId: e.correlationId,
        workerId: e.workerId,
        observedAt: e.observedAt,
        linkedAt: now,
      },
    });
    await tx.match.update({
      where: { id: matchId },
      data: { dotaMatchId: e.matchId },
    });
    productLog("match-link", { status: "GC_LINKED" });
    return link;
  });
}
export async function synchronizeMatchAnalytics(
  db: PrismaClient,
  actor: string,
  matchId: string,
  provider: typeof fetchMatchAnalytics = fetchMatchAnalytics,
) {
  const token = randomUUID();
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
    const m = await tx.match.findFirst({
      where: {
        id: matchId,
        roomId: { not: null },
        players: { some: { userId: actor } },
      },
      include: { externalLink: true, launchControl: true },
    });
    if (!m?.externalLink || m.dotaMatchId !== m.externalLink.dotaMatchId)
      throw new AccountError(
        "La partida todavía no tiene un vínculo Dota verificado.",
        409,
      );
    const now = await nowSql(tx);
    await tx.matchAnalyticsCache.upsert({
      where: { matchId },
      create: { matchId },
      update: {},
    });
    const c = await tx.matchAnalyticsCache.findUniqueOrThrow({
      where: { matchId },
    });
    const reconciliation = c.normalized as {
      reconciliation?: { attempts?: number; gcObtainedAt?: string };
    } | null;
    const gc = (
      m.launchControl?.warningJournal as {
        GC_DETAILS?: { code?: string; obtainedAt?: string };
      } | null
    )?.GC_DETAILS;
    const freshGc =
      ["AVAILABLE", "PARTIAL"].includes(gc?.code ?? "") &&
      !!gc?.obtainedAt &&
      gc.obtainedAt !== reconciliation?.reconciliation?.gcObtainedAt;
    if ((reconciliation?.reconciliation?.attempts ?? 0) >= 24 && !freshGc)
      return null;
    if (
      (!freshGc &&
        ((isMatchAnalytics(c.normalized, m.dotaMatchId!) &&
          c.expiresAt &&
          c.expiresAt > now) ||
          (c.retryAfter && c.retryAfter > now))) ||
      (c.leaseUntil && c.leaseUntil > now)
    ) {
      productLog("cache", { cache: "hit", status: "MATCH" });
      return null;
    }
    await tx.matchAnalyticsCache.update({
      where: { matchId },
      data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 90000) },
    });
    productLog("cache", { cache: "miss", status: "MATCH" });
    return m;
  });
  if (!claimed) return { requested: false };
  let providerStatuses: { source: string; status: string }[] = [];
  let providerEvidence: unknown[] = [];
  let gcObtainedAt: string | undefined;
  let result: MatchAnalytics | null = null,
    lastError: string | null = null,
    retryAfterMs = 0;
  if (provider === fetchMatchAnalytics) {
    const response = await fetchMatchSources(
      claimed.dotaMatchId!,
      async (source) =>
        db.$transaction(async (tx) => {
          const now = await nowSql(tx);
          const owns = await tx.matchAnalyticsCache.findFirst({
            where: { matchId, leaseToken: token, leaseUntil: { gt: now } },
          });
          return !!owns && reserveProviderBudget(tx, source, now);
        }),
    );
    const gc = (
      claimed.launchControl?.warningJournal as {
        GC_DETAILS?: {
          code?: string;
          externalMatchId?: string;
          obtainedAt?: string;
          snapshot?: unknown;
        };
      } | null
    )?.GC_DETAILS;
    let primary: MatchAnalytics | null = null;
    if (
      claimed.launchControl?.status === "STARTED" &&
      ["AVAILABLE", "PARTIAL"].includes(gc?.code ?? "") &&
      gc?.externalMatchId === claimed.dotaMatchId &&
      gc?.snapshot
    ) {
      try {
        primary = normalizeValveStyle(gc.snapshot, claimed.dotaMatchId!, "GC");
        primary.obtainedAt = gc.obtainedAt;
      } catch {
        /* Rejected GC data cannot become a result. */
      }
    }
    gcObtainedAt = gc?.obtainedAt;
    providerEvidence = [...(primary ? [primary] : []), ...response.evidence];
    result = selectMatchSnapshot([
      ...(primary ? [primary] : []),
      ...(response.snapshot ? [response.snapshot] : []),
    ]);
    if (primary)
      response.statuses.unshift({ source: "GC", status: "AVAILABLE" });
    providerStatuses = response.statuses;
    lastError = result
      ? result.conflicts.length
        ? "PROVIDER_CONFLICT"
        : null
      : response.statuses.some((p) => p.status === "RATE_LIMITED")
        ? "RATE_LIMITED"
        : response.statuses.some((p) =>
              ["API_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(p.status),
            )
          ? "API_ERROR"
          : "NOT_FOUND";
    for (const p of response.statuses.filter(
      (p) => p.status === "RATE_LIMITED",
    )) {
      const wait = Math.max(300000, p.retryAfterMs ?? 0);
      retryAfterMs = Math.max(retryAfterMs, wait);
      await db.$transaction(async (tx) => {
        const now = await nowSql(tx);
        await tx.dotaApiBudget.updateMany({
          where: {
            provider: p.source,
            OR: [
              { blockedUntil: null },
              { blockedUntil: { lt: new Date(now.getTime() + wait) } },
            ],
          },
          data: { blockedUntil: new Date(now.getTime() + wait) },
        });
      });
    }
  } else if (
    process.env.DRAFTORY_ENABLE_STRATZ !== "true" ||
    !process.env.STRATZ_TOKEN?.trim()
  )
    lastError = "NOT_CONFIGURED";
  else {
    const permitted = await db.$transaction(async (tx) => {
      const now = await nowSql(tx);
      const owns = await tx.matchAnalyticsCache.findFirst({
        where: { matchId, leaseToken: token, leaseUntil: { gt: now } },
      });
      return !!owns && reserveProviderBudget(tx, "STRATZ", now);
    });
    if (!permitted) lastError = "RATE_LIMITED";
    else
      try {
        const incoming = await provider(claimed.dotaMatchId!);
        if (!isMatchAnalytics(incoming, claimed.dotaMatchId!))
          throw new OpenDotaError("INVALID_RESPONSE");
        result = incoming;
        productLog("provider", { provider: "STRATZ", status: "AVAILABLE" });
      } catch (error) {
        lastError =
          error instanceof OpenDotaError ? error.reason : "INVALID_RESPONSE";
        productLog("provider", {
          provider: "STRATZ",
          status: "FAILED",
          reason: lastError,
        });
        if (lastError === "RATE_LIMITED") {
          retryAfterMs = Math.max(
            60000,
            error instanceof OpenDotaError
              ? (error.retryAfterMs ?? 300000)
              : 300000,
          );
          await db.$transaction(async (tx) => {
            const now = await nowSql(tx);
            await tx.dotaApiBudget.updateMany({
              where: {
                provider: "STRATZ",
                OR: [
                  { blockedUntil: null },
                  {
                    blockedUntil: {
                      lt: new Date(now.getTime() + retryAfterMs),
                    },
                  },
                ],
              },
              data: { blockedUntil: new Date(now.getTime() + retryAfterMs) },
            });
          });
        }
      }
  }
  if (result && !result.players.length) {
    result = null;
    lastError = "NO_PUBLIC_DATA";
  }
  const published = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "matchId" FROM "MatchAnalyticsCache" WHERE "matchId"=${matchId} FOR UPDATE`;
    const now = await nowSql(tx),
      old = await tx.matchAnalyticsCache.findUniqueOrThrow({
        where: { matchId },
      });
    if (old.leaseToken !== token || !old.leaseUntil || old.leaseUntil <= now)
      return false;
    if (result && isMatchAnalytics(old.normalized, claimed.dotaMatchId!)) {
      const conflict =
        selectMatchSnapshot([old.normalized, result])?.conflicts ?? [];
      if (conflict.length) {
        providerEvidence = [old.normalized, result, ...providerEvidence].slice(
          0,
          4,
        );
        result = null;
        lastError = "PROVIDER_CONFLICT";
      }
    }
    if (
      result &&
      isMatchAnalytics(old.normalized, claimed.dotaMatchId!) &&
      (result.source !== "GC" || old.normalized.source === "GC") &&
      poorerSnapshot(old.normalized, result)
    ) {
      result = null;
      lastError = "PARTIAL_RESPONSE";
    }
    const ttl =
      claimed.status === "COMPLETED"
        ? result?.players.length === 10 &&
          result.players.every((p) => p.heroId && p.kills !== null)
          ? 30 * 86400000
          : 900000
        : 120000;
    const attempts =
      ((old.normalized as { reconciliation?: { attempts?: number } } | null)
        ?.reconciliation?.attempts ?? 0) + 1;
    const past = (
      old.normalized as { reconciliation?: { history?: unknown[] } } | null
    )?.reconciliation?.history;
    const reconciliation = {
      attempts,
      checkedAt: now.toISOString(),
      exhausted: attempts >= 24,
      providers: providerStatuses,
      gcObtainedAt: gcObtainedAt ?? null,
      evidence: providerEvidence,
      history: [
        ...(Array.isArray(past) ? past : []).slice(-23),
        {
          at: now.toISOString(),
          providers: providerStatuses,
          error: lastError,
        },
      ],
    };
    const previous =
      old.normalized &&
      typeof old.normalized === "object" &&
      !Array.isArray(old.normalized)
        ? old.normalized
        : {};
    const normalized = { ...(result ?? previous), reconciliation };
    const failures = lastError ? old.failures + 1 : 0,
      backoff = Math.max(
        retryAfterMs,
        Math.min(3600000, 60000 * 2 ** Math.min(failures, 6)),
      );
    await tx.matchAnalyticsCache.update({
      where: { matchId },
      data: {
        normalized: normalized as unknown as Prisma.InputJsonValue,
        ...(result
          ? {
              fetchedAt: now,
              expiresAt: new Date(now.getTime() + ttl),
            }
          : {}),
        errorCode: lastError,
        failures,
        retryAfter: lastError ? new Date(now.getTime() + backoff) : null,
        leaseToken: null,
        leaseUntil: null,
      },
    });
    if (result) {
      const roster = await tx.dotaLobbyPlayer.findMany({ where: { matchId } });
      for (const p of roster) {
        const a = result.players.filter(
          (v) => v.accountId === steamAccountId(p.steamId),
        );
        if (a.length === 1 && a[0].heroId && a[0].side === p.team)
          await tx.matchPlayer.updateMany({
            where: { matchId, userId: p.userId, heroId: null },
            data: { heroId: a[0].heroId },
          });
      }
    }
    productLog("analytics", {
      status: result ? "CACHED" : "PRESERVED",
      reason: lastError ?? "OK",
    });
    return !!result || isMatchAnalytics(old.normalized, claimed.dotaMatchId!);
  });
  return { requested: true, available: published };
}
