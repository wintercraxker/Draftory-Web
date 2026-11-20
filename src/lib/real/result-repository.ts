import "server-only";
import {
  assertAttempt,
  scopeRequired,
  platformAuthorizationEnabled,
} from "../../../apps/dota-worker/attempt-authorization.mjs";
import { authorizationExecutor } from "./attempt-authorization";
import type { Prisma } from "../../generated/prisma/client";
import { enqueueTerminalCleanup } from "../../../apps/dota-worker/terminal-queue.mjs";

export async function queueTerminalCleanup(
  tx: Prisma.TransactionClient,
  matchId: string,
) {
  return enqueueTerminalCleanup(
    {
      query: async (sql: string, params: unknown[] = []) => {
        const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          sql,
          ...params,
        );
        return { rows, rowCount: rows.length };
      },
    },
    matchId,
  );
}
import { prisma } from "../prisma";
import { verifiedResult } from "./result-policy";
import { calculateEloChange, getXpProgress } from "../competitive";
import { competitiveConfig } from "../competitive/config";
import { pointsConfig } from "../progression/config";
import { applyPointMovement } from "./points-repository";
import { roomConfig } from "../rooms/config";

// No browser winner/result parameter. Reads only a server-published provider cache
// attached to a GC-linked, positively started attempt. Disabled by default.
export async function finalizeCachedResult(matchId: string, db = prisma) {
  const scoped = await scopeRequired(authorizationExecutor(db));
  if (
    (!scoped || platformAuthorizationEnabled()) &&
    process.env.DRAFTORY_ENABLE_DOTA_RESULTS !== "true"
  )
    return { applied: false, reason: "DISABLED" };
  return db.$transaction(
    async (tx) => {
      // adapter-pg decodes technical timestamptz using the session timezone.
      // Read GC/cache timestamps in UTC before comparing them to Valve UTC dates.
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await assertAttempt(authorizationExecutor(tx), matchId, "result");
      const initial = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: { select: { userId: true } } },
      });
      if (!initial?.roomId) return { applied: false, reason: "NO_ATTEMPT" };
      // Same User-before-ledger ordering as achievement reconciliation. Stable
      // order also serializes concurrent result workers without wallet deadlocks.
      const userIds = initial.players.map((p) => p.userId).sort();
      for (const id of userIds)
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${initial.roomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
      const m = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: {
          room: true,
          players: true,
          readyCheck: { include: { players: true } },
          dotaLobby: { include: { players: true } },
          launchControl: true,
          externalLink: { include: { analytics: true } },
        },
      });
      if (m.status === "COMPLETED")
        return { applied: false, reason: "ALREADY_COMPLETED" };
      const l = m.dotaLobby,
        link = m.externalLink,
        c = m.launchControl;
      if (
        m.status !== "IN_PROGRESS" ||
        !["IN_GAME", "FINISHED"].includes(m.room?.phase ?? "") ||
        !l?.gcConfirmedAt ||
        !link ||
        !c ||
        c.status !== "STARTED" ||
        !c.startedObservedAt ||
        !link.analytics?.fetchedAt ||
        link.analytics.errorCode ||
        m.dotaMatchId !== link.dotaMatchId ||
        c.externalMatchId !== link.dotaMatchId ||
        c.lobbyId !== l.id ||
        link.lobbyId !== l.lobbyId ||
        link.correlationId !== l.correlationId ||
        link.workerId !== l.workerId ||
        c.startedObservedAt < l.gcConfirmedAt ||
        link.observedAt < l.gcConfirmedAt ||
        link.analytics.fetchedAt < c.startedObservedAt ||
        link.analytics.leaseToken
      )
        return { applied: false, reason: "UNVERIFIED_LINK" };
      if (
        userIds.join() !==
          m.players
            .map((p) => p.userId)
            .sort()
            .join() ||
        l.players.length !== m.players.length ||
        m.players.some(
          (p) =>
            !l.players.some(
              (f) =>
                f.userId === p.userId &&
                f.team === p.teamSide &&
                f.slot === p.slot,
            ),
        )
      )
        return { applied: false, reason: "ROSTER_CONFLICT" };
      if (
        m.readyCheck?.status !== "PASSED" ||
        m.readyCheck.players.length !== m.players.length ||
        m.readyCheck.players.some((p) => !p.confirmedAt)
      )
        return { applied: false, reason: "READY_NOT_PASSED" };
      const now = (
        await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`
      )[0].now;
      const result = verifiedResult(
        link.analytics.normalized,
        {
          externalId: link.dotaMatchId,
          mode: m.mode,
          createdAt: m.createdAt,
          players: l.players,
        },
        now,
      );
      if (!result || result.finishedAt > link.analytics.fetchedAt)
        return { applied: false, reason: "RESULT_INCOMPLETE" };
      if (result.rewards) {
        const profiles = await tx.profile.findMany({
          where: { userId: { in: userIds } },
        });
        if (
          profiles.length !== userIds.length ||
          m.players.some((p) => p.eloBefore === null) ||
          (await tx.eloHistory.count({ where: { matchId } })) ||
          (await tx.xpHistory.count({ where: { matchId } })) ||
          (await tx.pointTransaction.count({
            where: { matchId, type: { in: ["MATCH_WIN", "MATCH_LOSS"] } },
          }))
        )
          return { applied: false, reason: "PROGRESSION_REQUIRES_REVIEW" };
        const average = (side: string) =>
          m.players
            .filter((p) => p.teamSide === side)
            .reduce((sum, p) => sum + p.eloBefore!, 0) / 5;
        for (const userId of userIds) {
          await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId"=${userId} FOR UPDATE`;
          const p = m.players.find((p) => p.userId === userId)!,
            profile = await tx.profile.findUniqueOrThrow({ where: { userId } }),
            won = p.teamSide === result.winningSide;
          const delta = calculateEloChange({
            elo: p.eloBefore!,
            opponentElo: average(p.teamSide === "RADIANT" ? "DIRE" : "RADIANT"),
            won,
          });
          const xpDelta = BigInt(
              competitiveConfig.xpPerMatch +
                (won ? competitiveConfig.xpWinBonus : 0),
            ),
            xpAfter = profile.xp + xpDelta,
            eloAfter = profile.elo + delta;
          const levelBefore = getXpProgress(profile.xp).level,
            levelAfter = getXpProgress(xpAfter).level;
          await tx.eloHistory.create({
            data: {
              matchId,
              userId,
              eloBefore: profile.elo,
              eloChange: delta,
              eloAfter,
              formulaVersion: "draftory-elo-v1",
            },
          });
          await tx.xpHistory.create({
            data: {
              matchId,
              userId,
              xpBefore: profile.xp,
              xpChange: xpDelta,
              xpAfter,
              levelBefore,
              levelAfter,
              formulaVersion: "draftory-xp-v1",
            },
          });
          await tx.profile.update({
            where: { userId },
            data: { elo: eloAfter, xp: xpAfter, level: levelAfter },
          });
          await tx.matchPlayer.update({
            where: { matchId_userId: { matchId, userId } },
            data: { eloAfter, xpAfter },
          });
          await applyPointMovement(tx, {
            userId,
            type: won ? "MATCH_WIN" : "MATCH_LOSS",
            amount: BigInt(won ? pointsConfig.victory : pointsConfig.defeat),
            key: `MATCH_REWARD:${matchId}:${userId}`,
            matchId,
            reference: "Partida Draftory verificada",
          });
        }
      }
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: "COMPLETED",
          winningSide: result.winningSide,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          durationSeconds: result.durationSeconds,
          recognitionEndsAt: result.rewards
            ? new Date(now.getTime() + roomConfig.commendVotingDurationMs)
            : null,
          revision: { increment: 1 },
        },
      });
      // Match timestamps are UTC wall values; the cleanup producer explicitly converts to timestamptz.
      await tx.$executeRaw`UPDATE "Match" SET "verifiedAt"=clock_timestamp() AT TIME ZONE 'UTC' WHERE id=${matchId}`;
      await tx.room.update({
        where: { id: m.roomId! },
        data: { phase: "FINISHED", revision: { increment: 1 } },
      });
      await tx.roomEvent.create({
        data: {
          roomId: m.roomId!,
          revision: m.room!.revision + 1,
          type: "MATCH_RESULT_VERIFIED",
          payload: {
            matchId,
            source: (link.analytics.normalized as { source: string }).source,
            externalMatchId: link.dotaMatchId,
            rewards: result.rewards,
          },
        },
      });
      await tx.notification.createMany({
        data: userIds.map((userId) => ({
          id: `result:${matchId}:${userId}`,
          userId,
          type: "MATCH_RESULT",
          createdAt: now,
          payload: {
            title: "Partida finalizada",
            description: "Resultado verificado de tu partida Draftory.",
            href: "/partidas",
            matchId,
          },
        })),
        skipDuplicates: true,
      });
      // Queue distinct terminal cleanup in this same result transaction. Never clear the marker here.
      await queueTerminalCleanup(tx, matchId);
      return { applied: true, reason: "VERIFIED", rewards: result.rewards };
    },
    { timeout: 20000 },
  );
}
