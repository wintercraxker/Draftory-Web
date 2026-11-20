import "server-only";
import { prisma } from "../prisma";
import type {
  Prisma,
  PointTransactionType,
} from "../../generated/prisma/client";
import { pointsConfig, achievementPointRewards } from "../progression/config";
import { AccountError } from "./http";
import { verifiedDraftoryMatch } from "./verified-match";
export type WalletDto = {
  balance: string;
  revision: number;
  serverNow: string;
  weeklyGained: string;
  totalStaked: string;
  entries: {
    id: string;
    type: string;
    amount: string;
    balanceAfter: string;
    reference: string | null;
    matchId: string | null;
    createdAt: string;
  }[];
};

// Internal transaction primitive; never exposed as an amount/type API to a client.
export async function applyPointMovement(
  tx: Prisma.TransactionClient,
  value: {
    userId: string;
    type: PointTransactionType;
    amount: bigint;
    key: string;
    matchId?: string;
    predictionId?: string;
    reference?: string;
  },
) {
  if (value.amount === BigInt(0) || !value.key || value.key.length > 200)
    throw new AccountError("Movimiento inválido.");
  await tx.pointWallet.createMany({
    data: [{ userId: value.userId }],
    skipDuplicates: true,
  });
  const [wallet] = await tx.$queryRaw<
    { balance: bigint }[]
  >`SELECT balance FROM "PointWallet" WHERE "userId"=${value.userId} FOR UPDATE`;
  const previous = await tx.pointTransaction.findUnique({
    where: { idempotencyKey: value.key },
  });
  if (previous) {
    if (
      previous.walletId !== value.userId ||
      previous.amount !== value.amount ||
      previous.type !== value.type ||
      previous.matchId !== (value.matchId ?? null) ||
      previous.predictionId !== (value.predictionId ?? null)
    )
      throw new AccountError(
        "La referencia ya pertenece a otra operación.",
        409,
      );
    return { ...previous, applied: false };
  }
  const balanceAfter = wallet.balance + value.amount;
  if (balanceAfter < BigInt(0))
    throw new AccountError("Puntos insuficientes.", 409);
  await tx.pointWallet.update({
    where: { userId: value.userId },
    data: { balance: balanceAfter, revision: { increment: 1 } },
  });
  const entry = await tx.pointTransaction.create({
    data: {
      walletId: value.userId,
      type: value.type,
      amount: value.amount,
      balanceAfter,
      idempotencyKey: value.key,
      matchId: value.matchId,
      predictionId: value.predictionId,
      reference: value.reference,
      createdAt: new Date(),
    },
  });
  return { ...entry, applied: true };
}
export async function rewardVerifiedMatches(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  let credited = BigInt(0);
  // Lock result rows before any wallet; a verifier cannot change authority mid-payment.
  await tx.$queryRaw`SELECT m.id FROM "Match" m JOIN "MatchPlayer" p ON p."matchId"=m.id WHERE p."userId"=${userId} AND m."roomId" IS NOT NULL AND m.status='COMPLETED' AND m."winningSide" IS NOT NULL AND m."verifiedAt" IS NOT NULL AND m."finishedAt" IS NOT NULL ORDER BY m.id FOR SHARE OF m`;
  const participants = await tx.matchPlayer.findMany({
    where: {
      userId,
      match: {
        roomId: { not: null },
        status: "COMPLETED",
        winningSide: { not: null },
        verifiedAt: { not: null },
        finishedAt: { not: null },
      },
    },
    include: {
      match: { include: { players: { select: { teamSide: true } } } },
    },
    orderBy: { matchId: "asc" },
  });
  for (const p of participants) {
    const m = p.match;
    if (!verifiedDraftoryMatch(m)) continue;
    const won = m.winningSide === p.teamSide,
      amount = BigInt(won ? pointsConfig.victory : pointsConfig.defeat),
      type = won ? "MATCH_WIN" : "MATCH_LOSS";
    // Preserve any legitimate ledger payment already recorded by an older path.
    await tx.$queryRaw`SELECT "userId" FROM "PointWallet" WHERE "userId"=${userId} FOR UPDATE`;
    const previous = await tx.pointTransaction.findFirst({
      where: {
        walletId: userId,
        matchId: m.id,
        type: { in: ["MATCH_WIN", "MATCH_LOSS"] },
      },
    });
    if (previous) {
      if (previous.type !== type || previous.amount !== amount)
        throw new AccountError(
          "Recompensa existente incompatible; requiere revisión.",
          409,
        );
      continue;
    }
    const entry = await applyPointMovement(tx, {
      userId,
      type,
      amount,
      key: `MATCH_REWARD:${m.id}:${userId}`,
      matchId: m.id,
      reference: "Partida Draftory verificada",
    });
    if (entry.applied) credited += amount;
  }
  return credited;
}
export async function rewardAchievement(
  tx: Prisma.TransactionClient,
  userId: string,
  achievementId: string,
) {
  const amount =
    achievementPointRewards[
      achievementId as keyof typeof achievementPointRewards
    ];
  if (!amount) return BigInt(0);
  const unlocked = await tx.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId } },
  });
  if (!unlocked) throw new AccountError("Logro no desbloqueado.", 409);
  const entry = await applyPointMovement(tx, {
    userId,
    type: "ACHIEVEMENT",
    amount: BigInt(amount),
    key: `ACHIEVEMENT:${userId}:${achievementId}`,
    reference: achievementId,
  });
  return entry.applied ? BigInt(amount) : BigInt(0);
}
export async function readWallet(
  userId: string,
  db = prisma,
): Promise<WalletDto> {
  return db.$transaction(
    async (tx) => {
      const [wallet, entries, summary] = await Promise.all([
        tx.pointWallet.findUnique({ where: { userId } }),
        tx.pointTransaction.findMany({
          where: { walletId: userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        }),
        tx.$queryRaw<
          { weekly: string; staked: string }[]
        >`SELECT COALESCE(sum(amount) FILTER (WHERE amount>0 AND "createdAt" AT TIME ZONE 'UTC'>=date_trunc('week',now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'),0)::text weekly,COALESCE(-sum(amount) FILTER (WHERE type='PREDICTION_STAKE'),0)::text staked FROM "PointTransaction" WHERE "walletId"=${userId}`,
      ]);
      return {
        balance: (wallet?.balance ?? BigInt(0)).toString(),
        revision: wallet?.revision ?? 0,
        serverNow: new Date().toISOString(),
        weeklyGained: summary[0].weekly,
        totalStaked: summary[0].staked,
        entries: entries.map((e) => ({
          id: e.id,
          type: e.type,
          amount: e.amount.toString(),
          balanceAfter: e.balanceAfter.toString(),
          reference: e.reference,
          matchId: e.matchId,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

// Invoked by a future trusted finalizer; no public endpoint can declare a winner.
export async function settleExistingPredictions(matchId: string, db = prisma) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { players: { select: { teamSide: true } } },
    });
    if (
      !match?.roomId ||
      !(match.status === "CANCELLED" || verifiedDraftoryMatch(match))
    )
      throw new AccountError("Resultado fiable no disponible.", 409);
    const pending = await tx.prediction.findMany({
      where: { matchId, status: "PENDING", freeParticipation: false },
      orderBy: { userId: "asc" },
    });
    let settled = 0;
    for (const p of pending) {
      // New points forecasts require fresh correlated GC authority in their dedicated settler.
      const evidence = p.resolutionEvidence as { policy?: string } | null;
      if (evidence?.policy === "DRAFTORY_POINTS_V1") continue;
      settled++;
      const status =
        match.status === "CANCELLED"
          ? "VOID"
          : p.team === match.winningSide
            ? "WON"
            : "LOST";
      const payout =
        status === "VOID"
          ? p.stakePoints
          : status === "WON"
            ? p.potentialReturn
            : BigInt(0);
      if (payout)
        await applyPointMovement(tx, {
          userId: p.userId,
          type: status === "VOID" ? "PREDICTION_REFUND" : "PREDICTION_WIN",
          amount: payout,
          key: `PREDICTION_SETTLE:${p.id}`,
          matchId,
          predictionId: p.id,
        });
      await tx.prediction.update({
        where: { id: p.id },
        data: { status, payoutPoints: payout, settledAt: new Date() },
      });
    }
    return { settled };
  });
}
