import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { AccountError, objectInput } from "./http";
import {
  forecastWindow,
  FREE_FORECAST_WINDOW_MS,
} from "./free-prediction-policy";
import { assertParticipation } from "./suspension";
import { applyPointMovement } from "./points-repository";
import {
  predictionAmount,
  predictionReturn,
  predictionPointsPolicy,
} from "../progression/prediction-points";
const include = {
  room: { select: { name: true, isPrivate: true } },
  players: { select: { userId: true, teamSide: true } },
  externalLink: true,
  launchControl: true,
} as const;
const forecasts = {
  OR: [
    { freeParticipation: true },
    {
      resolutionEvidence: {
        path: ["policy"],
        equals: predictionPointsPolicy.id,
      },
    },
  ],
} satisfies Prisma.PredictionWhereInput;
const managed = (evidence: Prisma.JsonValue | null) =>
  !!evidence &&
  typeof evidence === "object" &&
  !Array.isArray(evidence) &&
  evidence.policy === predictionPointsPolicy.id;
async function serverClock(tx: Prisma.TransactionClient) {
  const [clock] = await tx.$queryRaw<
    { ms: bigint }[]
  >`SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint ms`;
  return new Date(Number(clock.ms));
}
export async function registerPrediction(
  userId: string,
  input: unknown,
  db = prisma,
) {
  const v = objectInput(input, ["matchId", "team", "points"]);
  if (
    typeof v.matchId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(v.matchId) ||
    !["RADIANT", "DIRE"].includes(String(v.team))
  )
    throw new AccountError("Selecciona una partida y un equipo válidos.");
  const amount = predictionAmount(v.points);
  if (amount === null)
    throw new AccountError(
      `Introduce puntos enteros entre ${predictionPointsPolicy.minimum} y ${predictionPointsPolicy.maximum}, sin signos ni decimales.`,
    );
  const matchId = v.matchId,
    team = v.team as "RADIANT" | "DIRE";
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    await assertParticipation(tx, [userId], "PARTICIPATION");
    const previous = await tx.prediction.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });
    if (previous) {
      if (
        managed(previous.resolutionEvidence) &&
        previous.team === team &&
        previous.stakePoints === amount
      )
        return { id: previous.id, replayed: true };
      throw new AccountError(
        "Ya registraste tu pronóstico para esta partida. No se puede cambiar.",
        409,
      );
    }
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include,
    });
    const now = await serverClock(tx);
    if (!match || !forecastWindow(match, userId, now).eligible)
      throw new AccountError(
        "Esta partida no admite pronósticos: la ventana está cerrada, participas en ella o no tiene un inicio confirmado.",
        409,
      );
    const recent = await tx.prediction.count({
      where: {
        userId,
        ...forecasts,
        createdAt: { gte: new Date(now.getTime() - 86400000) },
      },
    });
    if (recent >= 100)
      throw new AccountError(
        "Alcanzaste el límite diario de pronósticos. Inténtalo mañana.",
        429,
      );
    const row = await tx.prediction.create({
      data: {
        matchId,
        userId,
        team,
        freeParticipation: false,
        stakePoints: amount,
        odds: "1.8000",
        potentialReturn: predictionReturn(amount),
        createdAt: now,
        resolutionEvidence: {
          policy: predictionPointsPolicy.id,
          oddsNumerator: 18,
          oddsDenominator: 10,
        },
      },
    });
    await applyPointMovement(tx, {
      userId,
      type: "PREDICTION_STAKE",
      amount: -amount,
      key: `PREDICTION_STAKE:${row.id}`,
      matchId,
      predictionId: row.id,
      reference: "Pronóstico · puntos virtuales confirmados",
    });
    return { id: row.id, replayed: false };
  });
}
// Trusted settlement only. A missing/disconnected GC cannot produce a winning payment.
export async function settleFreePredictions(matchId: string, db = prisma) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) return { settled: 0 };
    const cancelled = match.status === "CANCELLED";
    const linked = await tx.matchExternalLink.findUnique({
      where: { matchId },
    });
    if (
      !cancelled &&
      !(
        match.status === "COMPLETED" &&
        match.verifiedAt &&
        match.finishedAt &&
        match.winningSide &&
        match.dotaMatchId &&
        linked?.dotaMatchId === match.dotaMatchId
      )
    )
      return { settled: 0 };
    const now = await serverClock(tx),
      cache = await tx.matchAnalyticsCache.findUnique({ where: { matchId } });
    const n = cache?.normalized as {
      source?: string;
      externalMatchId?: string;
      radiantWin?: boolean;
      provenance?: { radiantWin?: string };
      conflicts?: unknown[];
    } | null;
    const gc =
      n?.source === "GC" &&
      n.externalMatchId === match.dotaMatchId &&
      typeof n.radiantWin === "boolean" &&
      (n.radiantWin ? "RADIANT" : "DIRE") === match.winningSide &&
      n.provenance?.radiantWin === "GC" &&
      Array.isArray(n.conflicts) &&
      n.conflicts.length === 0;
    const pending = await tx.prediction.findMany({
      where: { matchId, ...forecasts, status: "PENDING" },
      orderBy: [{ userId: "asc" }, { id: "asc" }],
    });
    let settled = 0;
    for (const p of pending) {
      const real = managed(p.resolutionEvidence);
      if (real && !cancelled && !gc) continue;
      if (real) {
        const debit = await tx.pointTransaction.findUnique({
          where: { idempotencyKey: `PREDICTION_STAKE:${p.id}` },
        });
        if (
          !debit ||
          debit.walletId !== p.userId ||
          debit.predictionId !== p.id ||
          debit.matchId !== matchId ||
          debit.type !== "PREDICTION_STAKE" ||
          debit.amount !== -p.stakePoints ||
          p.odds.toString() !== "1.8" ||
          p.potentialReturn !== predictionReturn(p.stakePoints)
        )
          throw new AccountError(
            "El registro de puntos requiere revisión. No se ha aplicado una devolución ni un premio.",
            409,
          );
      }
      const status = cancelled
        ? "VOID"
        : p.team === match.winningSide
          ? "WON"
          : "LOST";
      const payout = real
        ? cancelled
          ? p.stakePoints
          : status === "WON"
            ? p.potentialReturn
            : BigInt(0)
        : BigInt(0);
      if (payout > BigInt(0))
        await applyPointMovement(tx, {
          userId: p.userId,
          type: cancelled ? "PREDICTION_REFUND" : "PREDICTION_WIN",
          amount: payout,
          key: `PREDICTION_SETTLE:${p.id}`,
          matchId,
          predictionId: p.id,
          reference: cancelled
            ? "Pronóstico anulado · devolución de puntos"
            : "Pronóstico acertado · retorno total 1,80 · GC verificado",
        });
      await tx.prediction.update({
        where: { id: p.id },
        data: {
          status,
          payoutPoints: payout,
          settledAt: now,
          resolutionEvidence: {
            ...(real ? { policy: predictionPointsPolicy.id } : {}),
            authority: cancelled
              ? "DRAFTORY_CANCELLATION"
              : "DRAFTORY_VERIFIED_RESULT",
            provider: gc ? "GC" : null,
            matchId,
            externalMatchId: match.dotaMatchId,
            verifiedAt: match.verifiedAt?.toISOString() ?? null,
          },
        },
      });
      settled++;
    }
    return { settled };
  });
}
export async function synchronizeFreePredictions(userId: string, db = prisma) {
  const pending = await db.prediction.findMany({
    where: {
      userId,
      ...forecasts,
      status: "PENDING",
      match: { status: { in: ["COMPLETED", "CANCELLED"] } },
    },
    select: { matchId: true },
    distinct: ["matchId"],
    take: 100,
  });
  let settled = 0;
  for (const p of pending)
    settled += (await settleFreePredictions(p.matchId, db)).settled;
  return { settled };
}
// Read-only derived forecast points: never a wallet movement or competitive reward.
export { FORECAST_POINTS_PER_CORRECT } from "./forecast-performance";
import {
  FORECAST_POINTS_PER_CORRECT,
  readForecastPerformance,
} from "./forecast-performance";
const roster = {
  orderBy: [{ teamSide: "asc" }, { slot: "asc" }],
  select: {
    userId: true,
    teamSide: true,
    user: {
      select: { displayName: true, profile: { select: { visibility: true } } },
    },
  },
} satisfies Prisma.Match$playersArgs;
export async function readPredictions(userId: string, db = prisma) {
  return db.$transaction(
    async (tx) => {
      const now = await serverClock(tx);
      const [matches, tickets, performance, rankingRows] = await Promise.all([
        tx.match.findMany({
          where: {
            status: "IN_PROGRESS",
            startedAt: {
              gte: new Date(now.getTime() - FREE_FORECAST_WINDOW_MS),
            },
            room: { isPrivate: false },
          },
          include: {
            ...include,
            players: roster,
            teams: { select: { name: true, side: true } },
          },
          orderBy: { startedAt: "desc" },
          take: 100,
        }),
        tx.prediction.findMany({
          where: { userId, ...forecasts },
          include: {
            transactions: {
              where: { type: { in: ["PREDICTION_WIN", "PREDICTION_REFUND"] } },
              select: { amount: true, createdAt: true, id: true },
            },
            match: {
              select: {
                mode: true,
                status: true,
                verifiedAt: true,
                winningSide: true,
                players: roster,
                room: { select: { name: true, isPrivate: true } },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
        }),
        readForecastPerformance(tx, userId),
        tx.$queryRaw<
          {
            leaders: {
              name: string;
              score: number;
              position: number;
              isYou: boolean;
            }[];
            position: number | null;
          }[]
        >`
    WITH scores AS (
     SELECT p."userId",count(*) FILTER(WHERE p.status='WON')::int wins
     FROM "Prediction" p JOIN "Profile" profile ON profile."userId"=p."userId"
     LEFT JOIN "AccountLifecycle" life ON life."userId"=p."userId"
     WHERE (p."freeParticipation" OR p."resolutionEvidence"->>'policy'=${predictionPointsPolicy.id}) AND profile.visibility='PUBLIC' AND profile."onboardingCompletedAt" IS NOT NULL AND life."deletedAt" IS NULL
     GROUP BY p."userId" HAVING count(*) FILTER(WHERE p.status='WON')>0
    ), ranked AS (SELECT "userId",wins,dense_rank() OVER(ORDER BY wins DESC)::int position FROM scores)
    SELECT COALESCE((SELECT jsonb_agg(t ORDER BY t.position,t.name) FROM (
     SELECT COALESCE(u."displayName",'Jugador de Draftory') name,r.wins*${FORECAST_POINTS_PER_CORRECT} score,r.position,r."userId"=${userId} "isYou"
     FROM ranked r JOIN "User" u ON u.id=r."userId" ORDER BY r.position,r."userId" LIMIT 5
    ) t),'[]'::jsonb) leaders,(SELECT position FROM ranked WHERE "userId"=${userId}) position`,
      ]);
      const canView = (m: (typeof tickets)[number]["match"]) =>
        !m.room?.isPrivate &&
        m.players.some(
          (p) => p.userId === userId || p.user.profile?.visibility === "PUBLIC",
        );
      return {
        serverNow: now.toISOString(),
        pointsPolicy: {
          minimum: predictionPointsPolicy.minimum,
          maximum: predictionPointsPolicy.maximum,
          odds: predictionPointsPolicy.oddsLabel,
        },
        summary: { ...performance, position: rankingRows[0]?.position ?? null },
        leaderboard: rankingRows[0]?.leaders ?? [],
        available: matches
          .filter((m) => forecastWindow(m, userId, now).eligible)
          .map((m) => ({
            id: m.id,
            name: m.room!.name,
            mode: m.mode,
            region: m.region,
            status: m.status,
            closesAt: forecastWindow(m, userId, now).closesAt!.toISOString(),
            selection: tickets.find((p) => p.matchId === m.id)?.team ?? null,
            canViewDetails: canView(m),
            teams: (["RADIANT", "DIRE"] as const).map((side) => ({
              side,
              name:
                m.teams.find((t) => t.side === side)?.name ??
                (side === "RADIANT" ? "Radiant" : "Dire"),
              players: m.players
                .filter((p) => p.teamSide === side)
                .map((p) => ({
                  userId:
                    p.user.profile?.visibility === "PUBLIC"
                      ? p.userId
                      : undefined,
                  name:
                    p.user.profile?.visibility === "PUBLIC"
                      ? (p.user.displayName ?? "Jugador de Steam")
                      : "Jugador privado",
                })),
            })),
          })),
        tickets: tickets.map((p) => ({
          usesPoints: managed(p.resolutionEvidence),
          stakePoints: p.stakePoints.toString(),
          odds: p.odds.toString(),
          potentialReturn: p.potentialReturn.toString(),
          payoutPoints: p.payoutPoints?.toString() ?? null,
          reward: p.transactions[0]
            ? {
                amount: p.transactions[0].amount.toString(),
                creditedAt: p.transactions[0].createdAt.toISOString(),
                operationId: p.transactions[0].id,
              }
            : null,
          id: p.id,
          matchId: p.matchId,
          name: p.match.room?.isPrivate
            ? "Partida privada"
            : (p.match.room?.name ?? "Partida Draftory"),
          mode: p.match.mode,
          team: p.team,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          settledAt: p.settledAt?.toISOString() ?? null,
          evidence: p.resolutionEvidence,
          canViewDetails: canView(p.match),
          winningSide:
            p.status !== "PENDING" &&
            p.match.status === "COMPLETED" &&
            p.match.verifiedAt
              ? p.match.winningSide
              : null,
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type RealPredictions = Awaited<ReturnType<typeof readPredictions>>;
