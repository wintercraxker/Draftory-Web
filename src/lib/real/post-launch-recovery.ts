import "server-only";
import { prisma } from "../prisma";
import { queueTerminalCleanup } from "./result-repository";
import { roomFormat } from "../rooms/lobby-options.mjs";
import { requestContinuation } from "./room-continuation";
import type { Prisma } from "../../generated/prisma/client";

/** Web authority only. The restricted worker never receives Room/Match write rights. */
export async function recoverUnscoredPostLaunch(matchId: string, db = prisma) {
  if (process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY !== "true")
    return false;
  return db.$transaction((tx) => recoverUnscoredPostLaunchTx(matchId, tx));
}
export async function recoverUnscoredPostLaunchTx(
  matchId: string,
  tx: Prisma.TransactionClient,
) {
  // Player-controlled mode never infers a cancellation from loading, timeouts,
  // returned players or a watchdog. Only an approved vote starts its exit flow.
  if (process.env.DRAFTORY_ENABLE_PLAYER_CANCELLATION_RECOVERY === "true")
    return false;
  if (process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY !== "true")
    return false;
  const candidate = await tx.match.findUnique({
    where: { id: matchId },
    select: { roomId: true, mode: true },
  });
  if (!candidate?.roomId) return false;
  await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${candidate.roomId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Match" WHERE id=${matchId} FOR UPDATE`;
  const proof = await tx.$queryRaw<
    {
      lobby: string;
      correlation: string;
      worker: string;
      external: string;
      observed: Date;
      outcome: number;
      details: boolean;
    }[]
  >`
   SELECT l."lobbyId" lobby,l."correlationId"::text correlation,l."workerId" worker,c."externalMatchId" external,c."startedObservedAt" observed,
   CASE WHEN c."warningJournal"->'LIFECYCLE'->>'state'='POSTGAME' THEN (c."warningJournal"->'LIFECYCLE'->>'matchOutcome')::int ELSE (c."warningJournal"->'GC_DETAILS'->'snapshot'->>'match_outcome')::int END outcome,
   COALESCE(c."warningJournal"->'LIFECYCLE'->>'state','')<>'POSTGAME' details
   FROM "DotaLaunchControl" c JOIN "DotaLobby" l ON l.id=c."lobbyId" JOIN "Match" m ON m.id=c."matchId"
   WHERE m.id=${matchId} AND m.status IN ('QUEUED','IN_PROGRESS') AND m."verifiedAt" IS NULL AND m."winningSide" IS NULL
   AND c.status='STARTED' AND c."launchRequestId" IS NOT NULL AND c."consumedAt" IS NOT NULL AND c."startedObservedAt">=c."consumedAt"
   AND c."externalMatchId" ~ '^[1-9][0-9]{0,19}$' AND (m."dotaMatchId" IS NULL OR m."dotaMatchId"=c."externalMatchId")
   AND l."matchId"=m.id AND (l.state IN ('CONFIRMED','RECONCILING') OR l.state='CLOSED' AND EXISTS(SELECT 1 FROM "DotaTerminalCleanup" t WHERE t."lobbyId"=l.id AND t.status='CLOSED')) AND l."workerId" IS NOT NULL AND l."lobbyId" IS NOT NULL
   AND ((c."warningJournal"->'LIFECYCLE'->>'source'='GC' AND c."warningJournal"->'LIFECYCLE'->>'state'='POSTGAME'
   AND c."warningJournal"->'LIFECYCLE'->>'externalMatchId'=c."externalMatchId"
   AND (c."warningJournal"->'LIFECYCLE'->>'matchOutcome')::int BETWEEN 64 AND 69
   AND (c."warningJournal"->'LIFECYCLE'->>'postgameAt')::timestamptz BETWEEN c."startedObservedAt" AND clock_timestamp())
   OR (COALESCE(c."warningJournal"->'LIFECYCLE'->>'state','')<>'POSTGAME' AND c."warningJournal"->'GC_DETAILS'->>'source'='GC' AND c."warningJournal"->'GC_DETAILS'->>'code' IN ('AVAILABLE','PARTIAL')
   AND c."warningJournal"->'GC_DETAILS'->>'externalMatchId'=c."externalMatchId" AND c."warningJournal"->'GC_DETAILS'->'snapshot'->>'match_id'=c."externalMatchId"
   AND (c."warningJournal"->'GC_DETAILS'->'snapshot'->>'match_outcome')::int BETWEEN 64 AND 69
   AND (c."warningJournal"->'GC_DETAILS'->>'obtainedAt')::timestamptz BETWEEN c."startedObservedAt" AND clock_timestamp()))
   FOR UPDATE OF c,l`;
  const p = proof[0];
  if (!p) return false;
  const link = await tx.matchExternalLink.findUnique({ where: { matchId } });
  if (
    link &&
    (link.dotaMatchId !== p.external ||
      link.lobbyId !== p.lobby ||
      link.correlationId !== p.correlation ||
      link.workerId !== p.worker)
  )
    return false;
  if (!link)
    await tx.matchExternalLink.create({
      data: {
        matchId,
        dotaMatchId: p.external,
        lobbyId: p.lobby,
        correlationId: p.correlation,
        workerId: p.worker,
        observedAt: p.observed,
      },
    });
  if (p.details) {
    // Match-details is a distinct terminal source, never a fabricated lobby SO.
    // Keep the active fence until the existing worker confirms departure.
    await tx.match.update({
      where: { id: matchId },
      data: { status: "IN_PROGRESS", dotaMatchId: p.external },
    });
    await tx.dotaJob.updateMany({
      where: {
        lobby: { matchId },
        status: { in: ["PENDING", "LEASED", "RECONCILE"] },
      },
      data: {
        status: "CANCELLED",
        leaseToken: null,
        leaseUntil: null,
        errorCode: "GC_NOT_SCORED",
      },
    });
    await requestContinuation(tx, matchId, null);
    await queueTerminalCleanup(tx, matchId);
    const closed = await tx.$queryRaw<
      { closed: boolean }[]
    >`SELECT t.status='CLOSED' AND l.state='CLOSED' closed FROM "DotaTerminalCleanup" t JOIN "DotaLobby" l ON l.id=t."lobbyId" WHERE t."matchId"=${matchId}`;
    if (!closed.length) throw Error("POST_LAUNCH_CLEANUP_REQUIRED");
    if (closed[0]?.closed !== true) return false;
  }
  await tx.$executeRaw`UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",'{POST_LAUNCH_RECOVERY}',jsonb_build_object('source',${p.details ? "GC_DETAILS" : "GC"}::text,'externalMatchId',${p.external}::text,'outcome',${p.outcome}::int,'state','GC_NOT_SCORED','at',clock_timestamp())) WHERE "matchId"=${matchId}`;
  // Explicitly terminal without a winner: no progression or fictitious start time.
  await tx.match.update({
    where: { id: matchId },
    data: {
      status: "CANCELLED",
      dotaMatchId: p.external,
      finishedAt: new Date(),
      revision: { increment: 1 },
    },
  });
  await tx.readyCheck.updateMany({
    where: { matchId },
    data: { status: "CANCELLED" },
  });
  await tx.dotaJob.updateMany({
    where: {
      lobby: { matchId },
      status: { in: ["PENDING", "LEASED", "RECONCILE"] },
    },
    data: {
      status: "CANCELLED",
      leaseToken: null,
      leaseUntil: null,
      errorCode: "GC_NOT_SCORED",
    },
  });
  if (!p.details) {
    const queued = await queueTerminalCleanup(tx, matchId);
    if (!queued) {
      const existing = await tx.$queryRaw<
        { lobbyId: string }[]
      >`SELECT "lobbyId" FROM "DotaTerminalCleanup" WHERE "matchId"=${matchId}`;
      if (!existing.length) throw Error("POST_LAUNCH_CLEANUP_REQUIRED");
    }
  }
  await requestContinuation(tx, matchId, null);
  // Preserve a complete, unchanged roster for a human-confirmed new attempt.
  // The start command still fences on the old external cleanup below.
  const participants = await tx.matchPlayer.findMany({
    where: { matchId },
    select: { userId: true, teamSide: true },
  });
  const members = await tx.roomMember.findMany({
    where: {
      roomId: candidate.roomId,
      leftAt: null,
      team: { in: ["RADIANT", "DIRE"] },
    },
    select: { userId: true, team: true },
  });
  const format = roomFormat(candidate.mode);
  const retained =
    participants.length === format.players &&
    participants.filter((p) => p.teamSide === "RADIANT").length ===
      format.teamSize &&
    participants.filter((p) => p.teamSide === "DIRE").length ===
      format.teamSize &&
    members.length === format.players &&
    participants.every((p) =>
      members.some((m) => m.userId === p.userId && m.team === p.teamSide),
    );
  const previous = await tx.roomEvent.findFirst({
    where: { roomId: candidate.roomId },
    orderBy: { revision: "desc" },
    select: { payload: true },
  });
  const checkpoint =
    previous?.payload &&
    typeof previous.payload === "object" &&
    !Array.isArray(previous.payload)
      ? previous.payload.checkpoint
      : undefined;
  const room = await tx.room.update({
    where: { id: candidate.roomId },
    data: {
      phase: retained ? "READY" : "CANCELLED",
      closedAt: retained ? null : new Date(),
      revision: { increment: 1 },
    },
  });
  await tx.roomEvent.create({
    data: {
      roomId: room.id,
      revision: room.revision,
      type: "GC_UNSCORED_ATTEMPT_ENDED",
      payload: {
        matchId,
        workerId: p.worker,
        correlationId: p.correlation,
        source: "GC",
        outcome: p.outcome,
        capacityReleased: false,
        rewards: false,
        rosterRetained: retained,
        ...(checkpoint != null ? { checkpoint } : {}),
      },
    },
  });
  return true;
}
