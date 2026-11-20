import "server-only";
import { prisma } from "../prisma";
import {
  achievementDefinitions,
  type Achievement,
} from "../progression/config";
import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./http";
import { rewardVerifiedMatches, rewardAchievement } from "./points-repository";
import {
  achievementPointRewards,
  achievementXpRewards,
} from "../progression/config";
import { verifiedDraftorySql } from "./verified-match";
import { getXpProgress } from "../competitive";
async function xpRewardsInstalled(tx: Prisma.TransactionClient) {
  const [r] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(format('%I.%I',current_schema(),'AchievementXpHistory')) IS NOT NULL AS ready`;
  return r.ready;
}
async function rewardAchievementXp(
  tx: Prisma.TransactionClient,
  userId: string,
  achievementId: string,
) {
  const definition = await tx.achievementDefinition.findUnique({
    where: { id: achievementId },
  });
  if (!definition?.rewardXp) return BigInt(0);
  await tx.$queryRaw`SELECT "userId" FROM "Profile" WHERE "userId"=${userId} FOR UPDATE`;
  if (
    await tx.achievementXpHistory.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    })
  )
    return BigInt(0);
  const profile = await tx.profile.findUniqueOrThrow({ where: { userId } }),
    xpBefore = profile.xp,
    xpChange = BigInt(definition.rewardXp),
    xpAfter = xpBefore + xpChange;
  const levelBefore = getXpProgress(xpBefore).level,
    levelAfter = getXpProgress(xpAfter).level;
  await tx.achievementXpHistory.create({
    data: {
      userId,
      achievementId,
      xpBefore,
      xpChange,
      xpAfter,
      levelBefore,
      levelAfter,
      formulaVersion: "draftory-xp-achievement-v1",
    },
  });
  await tx.profile.update({
    where: { userId },
    data: { xp: xpAfter, level: levelAfter },
  });
  return xpChange;
}

export async function internalMetrics(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const [value] = await tx.$queryRaw<
    {
      played: number;
      wins: number;
      losses: number;
      bestStreak: number;
      commends: number;
      mvps: number;
      elo: number;
      xp: bigint;
    }[]
  >`
    WITH games AS (
      SELECT m.id, (m."winningSide" = mp."teamSide")::int won,
        sum(CASE WHEN m."winningSide" <> mp."teamSide" THEN 1 ELSE 0 END) OVER (ORDER BY m."finishedAt", m.id) island
      FROM "MatchPlayer" mp JOIN "Match" m ON m.id=mp."matchId"
      WHERE mp."userId"=${userId} AND ${verifiedDraftorySql}
    ), streaks AS (SELECT sum(won)::int size FROM games GROUP BY island)
    SELECT (SELECT count(*)::int FROM games) played, COALESCE((SELECT sum(won)::int FROM games),0) wins,
      (SELECT count(*)::int FROM games WHERE won=0) losses, COALESCE((SELECT max(size) FROM streaks),0) "bestStreak",
      (SELECT count(*)::int FROM "Commend" c JOIN games g ON g.id=c."matchId" WHERE c."toUserId"=${userId}) commends,
      (SELECT count(*)::int FROM "MatchMvp" v JOIN games g ON g.id=v."matchId" WHERE v."userId"=${userId}) mvps,
      p.elo, p.xp FROM "Profile" p WHERE p."userId"=${userId}`;
  if (!value) throw new AccountError("Perfil no disponible.", 404);
  const { xp, ...metrics } = value;
  return { ...metrics, level: getXpProgress(xp).level };
}
async function items(tx: Prisma.TransactionClient, userId: string) {
  const rewardSelect = (await xpRewardsInstalled(tx))
    ? { rewardXp: true as const }
    : {};
  const [metrics, definitions, unlocked] = await Promise.all([
    internalMetrics(tx, userId),
    tx.achievementDefinition.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        metric: true,
        target: true,
        enabled: true,
        ...rewardSelect,
      },
    }),
    tx.userAchievement.findMany({ where: { userId } }),
  ]);
  const achievements: Achievement[] = achievementDefinitions.flatMap((base) => {
    const definition = definitions.find((d) => d.id === base.id) ?? base;
    if ("enabled" in definition && !definition.enabled) return [];
    const progress = metrics[definition.metric as keyof typeof metrics] ?? 0;
    return [
      {
        ...base,
        rewardXp: (definition as { rewardXp?: number }).rewardXp ?? 0,
        name: definition.name,
        description: definition.description,
        target: definition.target,
        metric: definition.metric,
        progress: Math.max(0, Math.min(progress, definition.target)),
        unlockedAt: unlocked
          .find((u) => u.achievementId === base.id)
          ?.unlockedAt.getTime(),
      },
    ];
  });
  return { achievements, metrics };
}
export async function reconcileAchievements(userId: string, db = prisma) {
  return db.$transaction(async (tx) => {
    // Same actor lock serializes reconciliation; inserts/notification commit together.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const xpEnabled = await xpRewardsInstalled(tx);
    for (const d of achievementDefinitions) {
      if (xpEnabled)
        await tx.$executeRaw`INSERT INTO "AchievementDefinition" (id,name,description,metric,target,"rewardXp") VALUES (${d.id},${d.name},${d.description},${d.metric},${d.target},${achievementXpRewards[d.id]}) ON CONFLICT (id) DO NOTHING`;
      else
        await tx.$executeRaw`INSERT INTO "AchievementDefinition" (id,name,description,metric,target) VALUES (${d.id},${d.name},${d.description},${d.metric},${d.target}) ON CONFLICT (id) DO NOTHING`;
    }
    const now = new Date(
      (
        await tx.$queryRaw<
          { ms: number }[]
        >`SELECT (extract(epoch FROM clock_timestamp())*1000)::double precision ms`
      )[0].ms,
    );
    const state = await items(tx, userId);
    let xpAwarded = BigInt(0);
    let pointsAwarded = await rewardVerifiedMatches(tx, userId);
    for (const a of state.achievements)
      if (
        a.unlockedAt === undefined &&
        a.progress >= a.target &&
        a.target > 0
      ) {
        const created = await tx.userAchievement.createMany({
          data: [{ userId, achievementId: a.id, unlockedAt: now }],
          skipDuplicates: true,
        });
        if (created.count) {
          if (xpEnabled)
            xpAwarded += await rewardAchievementXp(tx, userId, a.id);
          pointsAwarded += await rewardAchievement(tx, userId, a.id);
          const reward =
            achievementPointRewards[
              a.id as keyof typeof achievementPointRewards
            ];
          await tx.notification.createMany({
            data: [
              {
                id: `achievement:${userId}:${a.id}`,
                userId,
                type: "ACHIEVEMENT",
                createdAt: now,
                payload: {
                  title: "Logro desbloqueado",
                  description:
                    a.description +
                    " · " +
                    a.name +
                    (a.rewardXp ? ` · +${a.rewardXp} XP` : "") +
                    (reward ? ` · +${reward} puntos` : ""),
                  href: "/perfil",
                  achievementId: a.id,
                  achievementName: a.name,
                  achievementDescription: a.description,
                },
              },
            ],
            skipDuplicates: true,
          });
        }
      }
    // Batch existing, verified internal events. One result/commend/MVP notice per match.
    const validIds = await tx.$queryRaw<
      { id: string }[]
    >`SELECT m.id FROM "Match" m JOIN "MatchPlayer" p ON p."matchId"=m.id WHERE p."userId"=${userId} AND ${verifiedDraftorySql} ORDER BY m."finishedAt" DESC,m.id ASC LIMIT 20`;
    const played = await tx.matchPlayer.findMany({
      where: { userId, matchId: { in: validIds.map((m) => m.id) } },
      include: {
        match: { select: { id: true, winningSide: true } },
        eloHistory: { select: { eloChange: true } },
      },
      orderBy: [{ match: { finishedAt: "desc" } }, { matchId: "asc" }],
    });
    const ids = played.map((p) => p.matchId);
    const [commends, mvps] = await Promise.all([
      tx.commend.groupBy({
        by: ["matchId"],
        where: { toUserId: userId, matchId: { in: ids } },
        _count: { _all: true },
      }),
      tx.matchMvp.findMany({
        where: { userId, matchId: { in: ids } },
        select: { matchId: true },
      }),
    ]);
    const notices: Prisma.NotificationCreateManyInput[] = [];
    for (const p of played) {
      const won = p.match.winningSide === p.teamSide,
        change = p.eloHistory?.eloChange;
      notices.push({
        id: `result:${userId}:${p.matchId}`,
        userId,
        type: "MATCH_RESULT",
        createdAt: now,
        payload: {
          description: `${won ? "Victoria" : "Derrota"}${change !== undefined ? ` · ${change > 0 ? "+" : ""}${change} ELO` : ""}`,
          href: "/partidas",
        },
      });
      const count =
        commends.find((c) => c.matchId === p.matchId)?._count._all ?? 0;
      if (count)
        notices.push({
          id: `commend:${userId}:${p.matchId}`,
          userId,
          type: "COMMEND",
          createdAt: now,
          payload: {
            description: `Recibiste ${count} reconocimiento${count === 1 ? "" : "s"} en una partida.`,
            href: "/partidas",
          },
        });
      if (mvps.some((v) => v.matchId === p.matchId))
        notices.push({
          id: `mvp:${userId}:${p.matchId}`,
          userId,
          type: "MVP",
          createdAt: now,
          payload: {
            description: "Fuiste elegido MVP de una partida Draftory.",
            href: "/partidas",
          },
        });
    }
    if (notices.length)
      await tx.notification.createMany({ data: notices, skipDuplicates: true });
    // Already unlocked achievements remain eligible after enabling rewards; ledger key protects the one-time credit.
    const unlocked = await tx.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    });
    for (const a of unlocked) {
      pointsAwarded += await rewardAchievement(tx, userId, a.achievementId);
      if (xpEnabled)
        xpAwarded += await rewardAchievementXp(tx, userId, a.achievementId);
    }
    return {
      ...(await items(tx, userId)),
      pointsAwarded: pointsAwarded.toString(),
      xpAwarded: xpAwarded.toString(),
    };
  });
}
export async function readAchievements(
  actorId: string,
  handle?: string,
  db = prisma,
) {
  const target = await db.user.findFirst({
    where: handle
      ? { OR: [{ id: handle }, { profile: { publicHandle: handle } }] }
      : { id: actorId },
    select: { id: true, profile: { select: { visibility: true } } },
  });
  if (
    !target?.profile ||
    (target.id !== actorId && target.profile.visibility !== "PUBLIC")
  )
    throw new AccountError("Perfil no disponible.", 404);
  return db.$transaction((tx) => items(tx, target.id), {
    isolationLevel: "RepeatableRead",
  });
}
