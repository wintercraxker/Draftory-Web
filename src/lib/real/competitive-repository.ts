import { competitiveRoomBlocker, roomFormat } from "../rooms/lobby-options.mjs";
import { getXpProgress } from "../competitive";
import { resolveDisplayAvatar } from "../display-avatar";
import { publicTeamRoles, type PublicTeamRole } from "../public-team";
import { randomInt, randomUUID, createHash } from "node:crypto";
import { prisma } from "../prisma";
import type {
  Prisma,
  RoomPhase,
  DotaRole,
  RoomTeam,
  MatchSide,
} from "../../generated/prisma/client";
import {
  transitionLobby,
  allPlayers,
  currentPickTeam,
  type LobbyState,
  type Action,
  type Team,
  type Move,
} from "../rooms/engine";
import { roomConfig, getRollRange } from "../rooms/config";
import { recoverUnscoredPostLaunchTx } from "./post-launch-recovery";
import { presentLobby } from "./presentation";
import { AccountError, objectInput, plainText } from "./http";
import { assertParticipation } from "./suspension";
import type { CompetitiveView, RealMember } from "./types";
import {
  enqueueDotaAttempt,
  cancelDotaAttempt,
  authorizeDotaLaunch,
  revokeDotaLaunch,
  requireSteamRoster,
  requireDotaAutomation,
  assertPreviousLobbyClosed,
  dotaProductView,
  projectDotaEvidence,
  externalDotaEnabled,
  dotaCancellationProtected,
} from "./dota-repository";
import { presenceInstalled, ensurePresenceTracking } from "./room-presence";
import { assertCompetitiveMmr, readOperationalMmrs } from "./mmr-repository";
import { roomAutomationBlocker } from "./room-automation-policy";
import {
  requestContinuation,
  readContinuation,
  bindContinuation,
  recycleContinuation,
  releaseContinuation,
} from "./room-continuation";

type Tx = Prisma.TransactionClient;
type Checkpoint = Pick<
  LobbyState,
  | "dice"
  | "choicesReady"
  | "reveal"
  | "firstPickStarted"
  | "minigameRevealAt"
  | "draftTurn"
  | "highlight"
  | "balanceProposal"
> & {
  roundId: string;
  sealed: Partial<Record<Team, Move>>;
  draftExpiredAt?: number;
};
const checkpointType = "COMPETITIVE";
const time = (now: number) =>
  new Date(now).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
const side = (team: string) => team.toLowerCase() as Team;
function empty(): Checkpoint {
  return {
    roundId: randomUUID(),
    sealed: {},
    dice: {},
    choicesReady: {},
    reveal: null,
    balanceProposal: null,
  };
}

async function load(tx: Tx, roomId: string) {
  const room = await tx.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      members: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        include: { user: { include: { profile: true, dotaAccount: true } } },
      },
    },
  });
  const event = await tx.roomEvent.findFirst({
    where: { roomId, type: checkpointType },
    orderBy: { revision: "desc" },
  });
  const cp =
    (event?.payload as { checkpoint?: Checkpoint } | null)?.checkpoint ??
    empty();
  const draft = await tx.draft.findFirst({
    where: { roomId, status: { not: "CANCELLED" } },
    orderBy: { version: "desc" },
  });
  const match = await tx.match.findFirst({
    where: { roomId },
    orderBy: { attemptNumber: "desc" },
  });
  const mmrs = await readOperationalMmrs(
    room.members.map((m) => m.userId),
    tx,
  );
  const frozen =
    match && ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"].includes(match.status)
      ? await tx.matchPlayer.findMany({
          where: { matchId: match.id },
          select: { userId: true, mmrSnapshot: true },
        })
      : [];
  const snapshots = new Map(frozen.map((p) => [p.userId, p.mmrSnapshot]));
  const members: RealMember[] = room.members.map((m) => ({
    userId: m.userId,
    name: m.user.displayName ?? m.user.username,
    avatar: resolveDisplayAvatar(m.user),
    team: m.team,
    roomRole: (m.roomRole?.toLowerCase() as RealMember["roomRole"]) ?? null,
    isCaptain: m.isCaptain,
    elo: m.user.profile?.elo ?? null,
    level: m.user.profile ? getXpProgress(m.user.profile.xp).level : null,
    mmr: snapshots.has(m.userId)
      ? snapshots.get(m.userId)!
      : mmrs.has(m.userId)
        ? mmrs.get(m.userId)!.value
        : (m.user.dotaAccount?.mmr ?? null),
    mmrVerified: snapshots.has(m.userId)
      ? undefined
      : mmrs.get(m.userId)?.verified,
    mmrFrozen: snapshots.has(m.userId),
  }));
  const state = presentLobby({
    id: room.id,
    name: room.name,
    creatorId: room.creatorId,
    creatorName: "",
    mode: room.mode,
    region: room.region,
    phase: room.phase,
    formation: room.formation,
    firstPickMethod: room.firstPickMethod,
    isPrivate: room.isPrivate,
    revision: room.revision,
    participants: members.length,
    assigned: 0,
    capacity: roomConfig.maxParticipants,
    joined: false,
    members,
  });
  Object.assign(state, cp);
  state.pick = draft?.pickCursor ?? 0;
  state.pickOrder = (draft?.pickOrder as ("A" | "B")[]) ?? [
    ...roomConfig.pickOrder,
  ];
  state.first = draft?.firstPickSide ? side(draft.firstPickSide) : null;
  state.firstPickSource = state.first ? "minigame" : undefined;
  // A lone creator flag is real, but the pure engine requires a complete pair.
  if (!state.captains?.radiant || !state.captains?.dire) state.captains = null;
  if (match) {
    state.cancellationClosed =
      match.status === "COMPLETED" || !!match.verifiedAt || !!match.winningSide;
    state.attempt = {
      id: match.id,
      number: match.attemptNumber,
      startedAt: match.createdAt.getTime(),
    };
    const ready = await tx.readyCheck.findUnique({
      where: { matchId: match.id },
      include: {
        players: { include: { participant: { include: { user: true } } } },
      },
    });
    if (
      ready &&
      (room.phase === "READY_CHECK" ||
        room.phase === "PREPARING" ||
        room.phase === "WAITING_FOR_PLAYERS" ||
        room.phase === "IN_GAME" ||
        (room.phase === "READY" && ready.status === "FAILED"))
    )
      state.readyCheck = {
        status: ready.status,
        startedAt: ready.startedAt.getTime(),
        expiresAt: ready.expiresAt.getTime(),
        completedAt: ready.completedAt?.getTime(),
        reason: ready.failureReason ?? undefined,
        readyPlayerIds: ready.players
          .filter((p) => p.confirmedAt)
          .map((p) => p.userId),
        players: ready.players.map((p) => ({
          id: p.userId,
          name: p.participant.user.displayName ?? p.participant.user.username,
          team: side(p.participant.teamSide),
        })),
      };
    const votes = await tx.roomCancellationVote.findMany({
      where: { matchId: match.id },
    });
    if (votes.length)
      state.cancelVote = {
        attemptId: match.id,
        voterIds: votes.map((v) => v.userId),
        status:
          match.status === "CANCELLED" ||
          votes.length >= roomFormat(room.mode).cancellationVotes!
            ? "PASSED"
            : "OPEN",
      };
    state.externalLobbyPending =
      room.phase === "PREPARING" &&
      match.status === "QUEUED" &&
      state.readyCheck?.status === "PASSED";
    state.dotaLobby = await dotaProductView(tx, match.id);
    state.externalCancellationPending =
      room.phase === "IN_GAME" ||
      state.dotaLobby?.automationPhase === "CANCELLING" ||
      !!state.dotaLobby?.cancellationDiagnostic ||
      ["STARTING", "STARTED"].includes(state.dotaLobby?.productStatus ?? "");
  }
  state.continuation = await readContinuation(tx, roomId);
  return { room, state, cp, draft, match };
}

function snapshot(state: LobbyState, cp: Checkpoint): Checkpoint {
  return {
    roundId: cp.roundId,
    sealed: cp.sealed,
    dice: state.dice,
    choicesReady: state.choicesReady,
    reveal: state.reveal,
    firstPickStarted: state.firstPickStarted,
    minigameRevealAt: state.minigameRevealAt,
    draftTurn: state.draftTurn,
    highlight: state.highlight,
    balanceProposal: state.balanceProposal,
    draftExpiredAt: cp.draftExpiredAt,
  };
}
async function event(
  tx: Tx,
  roomId: string,
  actorId: string | null,
  revision: number,
  cp: Checkpoint,
  command: string,
  requestId?: string,
  fingerprint?: string,
  phases?: { from: RoomPhase; to: RoomPhase },
) {
  await tx.room.update({ where: { id: roomId }, data: { revision } });
  await tx.roomEvent.create({
    data: {
      roomId,
      actorId,
      revision,
      type: checkpointType,
      payload: JSON.parse(
        JSON.stringify({
          command,
          requestId,
          fingerprint,
          phases,
          checkpoint: cp,
        }),
      ),
    },
  });
}
async function persist(
  tx: Tx,
  loaded: Awaited<ReturnType<typeof load>>,
  next: LobbyState,
  actorId: string,
  action: Action,
  cp: Checkpoint,
  now: number,
  requestId?: string,
  fingerprint?: string,
) {
  const { room, state, draft } = loaded;
  // Clear flags first: partial unique captain indexes remain valid on replacements.
  await tx.roomMember.updateMany({
    where: { roomId: room.id, isCaptain: true },
    data: { isCaptain: false },
  });
  const remaining = new Set(allPlayers(next).map((p) => p.id));
  for (const old of room.members)
    if (!remaining.has(old.userId))
      await tx.roomMember.update({
        where: { roomId_userId: { roomId: room.id, userId: old.userId } },
        data: { leftAt: new Date(now), isCaptain: false },
      });
  for (const zone of ["radiant", "dire", "bench"] as const)
    for (const player of next[zone]) {
      const captain =
        zone !== "bench" &&
        (next.captains?.[zone] === player.id ||
          (next.phase === "CHOOSING_CAPTAINS" && player.id === room.creatorId));
      await tx.roomMember.update({
        where: { roomId_userId: { roomId: room.id, userId: player.id } },
        data: {
          team: zone.toUpperCase() as RoomTeam,
          isCaptain: captain,
          roomRole: (player.roomRole?.toUpperCase() as DotaRole) ?? null,
        },
      });
    }
  await tx.room.update({
    where: { id: room.id },
    data: {
      phase: next.phase as RoomPhase,
      formation: next.formation.toUpperCase() as "CAPTAINS" | "AUTOMATIC",
      firstPickMethod: next.game.toUpperCase() as "DICE" | "ROLL" | "RPS",
    },
  });
  let activeDraft = draft;
  if (
    ["kick", "leave"].includes(action.type) &&
    state.captains &&
    !next.captains &&
    draft
  ) {
    await tx.draft.update({
      where: { id: draft.id },
      data: { status: "CANCELLED" },
    });
    activeDraft = null;
  }
  if (action.type === "prepare") {
    if (draft)
      await tx.draft.update({
        where: { id: draft.id },
        data: { status: "CANCELLED" },
      });
    const last = await tx.draft.aggregate({
      where: { roomId: room.id },
      _max: { version: true },
    });
    activeDraft = await tx.draft.create({
      data: {
        roomId: room.id,
        version: (last._max.version ?? 0) + 1,
        status: "WAITING",
        pickOrder: [...roomConfig.pickOrder],
      },
    });
  }
  if (activeDraft) {
    if (action.type === "pick") {
      const team = currentPickTeam(state)!;
      await tx.draftPick.create({
        data: {
          draftId: activeDraft.id,
          ordinal: activeDraft.pickCursor + 1,
          team: team.toUpperCase() as MatchSide,
          captainId: actorId,
          playerId: action.playerId,
        },
      });
    }
    await tx.draft.update({
      where: { id: activeDraft.id },
      data: {
        status:
          next.phase === "CHOOSING_CAPTAINS"
            ? "WAITING"
            : next.phase === "DECIDING_FIRST_PICK"
              ? "DECIDING_FIRST_PICK"
              : next.phase === "DRAFTING"
                ? "PICKING"
                : next.first
                  ? "COMPLETE"
                  : activeDraft.status,
        firstPickSide: (next.first?.toUpperCase() as MatchSide) ?? null,
        pickCursor: next.pick,
        revision: { increment: 1 },
        ...(next.phase === "READY" && next.first && !activeDraft.completedAt
          ? { completedAt: new Date(now) }
          : {}),
      },
    });
  }
  if (action.type === "start") {
    // A retained roster after failed Launch cannot start a second external session.
    await assertPreviousLobbyClosed(tx, room.id);
    await requireSteamRoster(
      tx,
      [...next.radiant, ...next.dire].map((p) => p.id),
      room.mode,
    );
    await requireDotaAutomation(tx, room.mode);
    const last = await tx.match.aggregate({
      where: { roomId: room.id },
      _max: { attemptNumber: true },
    });
    const match = await tx.match.create({
      data: {
        roomId: room.id,
        attemptNumber: (last._max.attemptNumber ?? 0) + 1,
        mode: room.mode,
        region: room.region,
        teams: { create: [{ side: "RADIANT" }, { side: "DIRE" }] },
      },
    });
    for (const team of ["radiant", "dire"] as const)
      for (const [index, p] of next[team].entries()) {
        const original = room.members.find((m) => m.userId === p.id)!;
        await tx.matchPlayer.create({
          data: {
            matchId: match.id,
            userId: p.id,
            teamSide: team.toUpperCase() as MatchSide,
            slot: index + 1,
            isCaptain: next.captains?.[team] === p.id,
            roomRole: original.roomRole,
            mmrSnapshot: p.mmrAvailable === false ? null : p.mmr,
            eloBefore: original.user.profile?.elo,
            xpBefore: original.user.profile?.xp,
            levelSnapshot: original.user.profile
              ? getXpProgress(original.user.profile.xp).level
              : null,
          },
        });
      }
    await bindContinuation(tx, room.id, match.id);
    await authorizeDotaLaunch(tx, match.id, actorId);
    await tx.readyCheck.create({
      data: {
        roomId: room.id,
        matchId: match.id,
        startedAt: new Date(now),
        expiresAt: new Date(next.readyCheck!.expiresAt),
        players: {
          create: next.readyCheck!.players.map((p) => ({ userId: p.id })),
        },
      },
    });
  } else if (
    state.attempt &&
    next.readyCheck &&
    ["confirmReady", "expireReadyCheck"].includes(action.type)
  ) {
    const check = await tx.readyCheck.findUniqueOrThrow({
      where: { matchId: state.attempt.id },
    });
    if (
      action.type === "confirmReady" &&
      next.readyCheck.readyPlayerIds.includes(actorId) &&
      !state.readyCheck?.readyPlayerIds.includes(actorId)
    )
      await tx.readyCheckPlayer.update({
        where: {
          readyCheckId_userId: { readyCheckId: check.id, userId: actorId },
        },
        data: { confirmedAt: new Date(now) },
      });
    await tx.readyCheck.update({
      where: { id: check.id },
      data: {
        status: next.readyCheck.status,
        expiresAt: new Date(next.readyCheck.expiresAt),
        completedAt:
          next.readyCheck.status !== "PENDING" ? new Date(now) : null,
        failureReason: next.readyCheck.reason,
      },
    });
    if (next.readyCheck.status === "FAILED") {
      await tx.match.update({
        where: { id: state.attempt.id },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(now),
          revision: { increment: 1 },
        },
      });
      await revokeDotaLaunch(tx, state.attempt.id);
      await recycleContinuation(tx, state.attempt.id);
    }
    if (
      next.readyCheck.status === "PASSED" &&
      state.readyCheck?.status !== "PASSED"
    )
      await enqueueDotaAttempt(tx, state.attempt.id);
  }
  if (action.type === "voteCancel") {
    await tx.roomCancellationVote.upsert({
      where: { matchId_userId: { matchId: action.attemptId, userId: actorId } },
      create: { matchId: action.attemptId, userId: actorId },
      update: {},
    });
    const playerControlled =
      process.env.DRAFTORY_ENABLE_PLAYER_CANCELLATION_RECOVERY === "true";
    if (next.cancelVote?.status === "PASSED" && !playerControlled)
      await requestContinuation(tx, action.attemptId, actorId);
    if (next.cancelVote?.status === "PASSED" && playerControlled) {
      const capability = await tx.$queryRaw<
        { present: boolean }[]
      >`SELECT to_regprocedure('draftory_player_cancellation_capability()') IS NOT NULL present`;
      if (!capability[0]?.present)
        throw new AccountError(
          "La nueva cancelación todavía no está habilitada.",
          503,
        );
      // The Room/Match transaction serializes this decision with result approval.
      // Votes are durable before the SQL approval fence checks the threshold.
      await tx.$executeRaw`UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",'{CANCELLATION_REQUEST}',jsonb_build_object('state','APPROVED','requestId',${randomUUID()}::text,'at',clock_timestamp(),'required',${roomFormat(room.mode).cancellationVotes}::int,'externalStopConfirmed',false)) WHERE "matchId"=${action.attemptId} AND "warningJournal"->'CANCELLATION_REQUEST'->>'state' IS DISTINCT FROM 'APPROVED'`;
      const current = await tx.match.findUniqueOrThrow({
        where: { id: action.attemptId },
      });
      if (
        current.status === "COMPLETED" ||
        current.verifiedAt ||
        current.winningSide
      )
        throw new Error("La partida ya tiene un resultado final confirmado.");
      await tx.match.update({
        where: { id: action.attemptId },
        data: { status: "CANCELLED", revision: { increment: 1 } },
      });
      await tx.readyCheck.updateMany({
        where: { matchId: action.attemptId },
        data: { status: "CANCELLED" },
      });
      await cancelDotaAttempt(tx, action.attemptId);
      if (!state.externalCancellationPending)
        await recycleContinuation(tx, action.attemptId);
    }
    if (
      next.cancelVote?.status === "PASSED" &&
      state.externalCancellationPending &&
      !playerControlled
    ) {
      // Durable request only. Do not cancel Match/jobs or release a lease on a vote.
      await tx.$executeRaw`UPDATE "DotaLaunchControl" SET "warningJournal"=jsonb_set("warningJournal",'{CANCELLATION_REQUEST}',jsonb_build_object('state','REQUESTED','at',clock_timestamp(),'required',${roomFormat(room.mode).cancellationVotes}::int,'externalStopConfirmed',false)) WHERE "matchId"=${action.attemptId} AND NOT ("warningJournal" ? 'CANCELLATION_REQUEST')`;
    }
    if (
      next.cancelVote?.status === "PASSED" &&
      !state.externalCancellationPending &&
      !playerControlled
    ) {
      await revokeDotaLaunch(tx, action.attemptId);
      await tx.match.update({
        where: { id: action.attemptId },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(now),
          revision: { increment: 1 },
        },
      });
      await tx.readyCheck.update({
        where: { matchId: action.attemptId },
        data: { status: "CANCELLED" },
      });
      await cancelDotaAttempt(tx, action.attemptId);
      await recycleContinuation(tx, action.attemptId);
    }
  }
  for (const message of next.messages.slice(state.messages.length))
    await tx.roomMessage.create({
      data: {
        roomId: room.id,
        kind: message.kind === "system" ? "SYSTEM" : "USER",
        authorId: message.kind === "user" ? actorId : null,
        body: message.text,
      },
    });
  await event(
    tx,
    room.id,
    ["expireReadyCheck", "revealRound"].includes(action.type) ? null : actorId,
    room.revision + 1,
    snapshot(next, cp),
    action.type,
    requestId,
    fingerprint,
    { from: room.phase, to: next.phase as RoomPhase },
  );
}

async function advance(tx: Tx, roomId: string, now: number) {
  if (process.env.DRAFTORY_ENABLE_PLAYER_CANCELLATION_RECOVERY === "true") {
    // SQL success still retains capacity until the private departure marker is
    // acknowledged. Only the committed CANCEL_LOBBY errorCode=NULL closes this.
    const done = await tx.$queryRaw<
      { id: string }[]
    >`SELECT m.id FROM "Match" m JOIN "DotaLaunchControl" c ON c."matchId"=m.id JOIN "DotaLobby" l ON l."matchId"=m.id
      WHERE m."roomId"=${roomId} AND m.status='CANCELLED' AND c."warningJournal"->'CANCELLATION_REQUEST'->>'state'='APPROVED'
      AND (
        (l.state='CLOSED' AND l."lobbyId" IS NULL AND NOT EXISTS(SELECT 1 FROM "DotaJob" j WHERE j."lobbyId"=l.id))
        OR (
          l.state IN ('CANCELLED','CLOSED')
          AND EXISTS(SELECT 1 FROM "DotaJob" j WHERE j."lobbyId"=l.id AND j.kind='CANCEL_LOBBY' AND j.status='SUCCEEDED' AND j."errorCode" IS NULL)
          AND NOT EXISTS(SELECT 1 FROM "DotaJob" j WHERE j."lobbyId"=l.id AND j.status IN ('PENDING','LEASED','RECONCILE'))
        )
      )
      ORDER BY m."attemptNumber" DESC LIMIT 1`;
    if (done[0]) {
      const reopened = await tx.room.updateMany({
        where: {
          id: roomId,
          phase: { in: ["IN_GAME", "PREPARING", "WAITING_FOR_PLAYERS"] },
        },
        data: { phase: "READY", revision: { increment: 1 } },
      });
      if (reopened.count) {
        const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
        await tx.roomEvent.create({
          data: {
            roomId,
            revision: room.revision,
            type: "PLAYER_CANCELLATION_DEPARTURE_CONFIRMED",
            payload: {
              matchId: done[0].id,
              rewards: false,
              externalDepartureConfirmed: true,
            },
          },
        });
      }
    }
  }
  if (process.env.DRAFTORY_ENABLE_DOTA_POST_LAUNCH_RECOVERY === "true") {
    const pending = await tx.$queryRaw<
      { id: string }[]
    >`SELECT m.id FROM "Match" m JOIN "DotaLaunchControl" c ON c."matchId"=m.id WHERE m."roomId"=${roomId} AND m.status IN ('QUEUED','IN_PROGRESS') AND c."warningJournal" ? 'CANCELLATION_REQUEST' ORDER BY m."attemptNumber" DESC LIMIT 1`;
    if (pending[0]) await recoverUnscoredPostLaunchTx(pending[0].id, tx);
  }
  await projectDotaEvidence(tx, roomId);
  const loaded = await load(tx, roomId);
  const { state, cp } = loaded;
  let action: Action | undefined;
  let actor = state.hostId;
  if (
    state.phase === "READY_CHECK" &&
    state.readyCheck?.status === "PENDING" &&
    state.readyCheck.expiresAt <= now
  )
    action = { type: "expireReadyCheck" };
  if (
    state.phase === "DECIDING_FIRST_PICK" &&
    state.minigameRevealAt !== undefined &&
    state.minigameRevealAt <= now &&
    cp.sealed.radiant &&
    cp.sealed.dire
  ) {
    action = {
      type: "revealRound",
      radiant: cp.sealed.radiant,
      dire: cp.sealed.dire,
    };
    actor = state.captains!.radiant;
  }
  if (action) {
    const next = transitionLobby(state, action, actor, time(now), now);
    if (action.type === "revealRound") {
      cp.sealed = {};
      if (!next.first) cp.roundId = randomUUID();
    }
    await persist(tx, loaded, next, actor, action, cp, now);
  } else if (
    state.phase === "DRAFTING" &&
    state.draftTurn &&
    state.draftTurn.expiresAt <= now &&
    cp.draftExpiredAt !== state.draftTurn.expiresAt
  ) {
    cp.draftExpiredAt = state.draftTurn.expiresAt;
    await tx.roomMessage.create({
      data: {
        roomId,
        kind: "SYSTEM",
        body: "Tiempo de pick agotado. Sin selección automática; el capitán mantiene el turno.",
      },
    });
    await event(
      tx,
      roomId,
      null,
      loaded.room.revision + 1,
      cp,
      "draftDeadlineExpired",
    );
  }
}
async function lock(tx: Tx, roomId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`;
  if (!rows.length) throw new AccountError("Sala no disponible.", 404);
}
export async function advanceCompetitiveRoom(roomId: string, db = prisma) {
  await db.$transaction(async (tx) => {
    await lock(tx, roomId);
    await ensurePresenceTracking(tx, roomId);
    await advance(tx, roomId, Date.now());
    await projectDotaEvidence(tx, roomId);
  });
}
// Called inside roomAction's existing Room lock/transaction, never a second transaction.
export async function leaveCompetitiveMember(
  tx: Tx,
  roomId: string,
  userId: string,
) {
  const loaded = await load(tx, roomId);
  const { room, state, draft, cp } = loaded;
  if (room.creatorId === userId)
    throw new AccountError(
      "El creador debe cerrar la sala explícitamente; transferencia pendiente.",
      409,
    );
  if (
    ![
      "WAITING",
      "CHOOSING_CAPTAINS",
      "DECIDING_FIRST_PICK",
      "DRAFTING",
      "READY",
    ].includes(room.phase)
  )
    throw new AccountError("El roster del intento está congelado.", 409);
  const now = Date.now();
  const next = transitionLobby(
    state,
    { type: "leave" },
    userId,
    time(now),
    now,
  );
  if (
    draft?.status === "COMPLETE" &&
    next.captains &&
    next.phase === "DRAFTING"
  ) {
    next.phase = "WAITING";
    next.draftTurn = undefined;
  }
  if (state.captains && !next.captains) Object.assign(cp, empty());
  await persist(tx, loaded, next, userId, { type: "leave" }, cp, now);
}
export async function competitiveView(
  roomId: string,
  transaction?: Tx,
  db = prisma,
): Promise<CompetitiveView> {
  const read = async (tx: Tx): Promise<CompetitiveView> => {
    const { state, cp } = await load(tx, roomId);
    const messages = await tx.roomMessage.findMany({
      where: { roomId },
      include: {
        author: {
          select: {
            displayName: true,
            username: true,
            avatar: true,
            customAvatarUrl: true,
          },
        },
      },
      orderBy: { sequence: "desc" },
      take: 200,
    });
    // One bounded batch for every author; never trust roles from message payloads.
    const authorIds = [
      ...new Set(
        messages.flatMap((message) =>
          message.authorId ? [message.authorId] : [],
        ),
      ),
    ];
    const grants = authorIds.length
      ? await tx.staffAuthorization.findMany({
          where: { userId: { in: authorIds }, revokedAt: null },
          select: { userId: true, role: true },
        })
      : [];
    const authorRoles = new Map(
      grants
        .filter((grant) => Object.hasOwn(publicTeamRoles, grant.role))
        .map((grant) => [grant.userId, grant.role as PublicTeamRole]),
    );
    // Explicit allowlist. Never serialize RoomEvent, sealed choices or command payloads.
    return {
      automationBlocker: roomAutomationBlocker(state.mode ?? "ALL_PICK"),
      roundId: cp.roundId,
      serverNow: Date.now(),
      first: state.first,
      pick: state.pick,
      pickOrder: state.pickOrder,
      dice: state.dice,
      choicesReady: state.choicesReady,
      reveal: state.reveal,
      firstPickStarted: state.firstPickStarted,
      firstPickSource: state.firstPickSource,
      minigameRevealAt: state.minigameRevealAt,
      draftTurn: state.draftTurn,
      draftExpiredAt: cp.draftExpiredAt,
      highlight: state.highlight,
      balanceProposal: state.balanceProposal,
      readyCheck: state.readyCheck,
      attempt: state.attempt,
      cancelVote: state.cancelVote,
      externalLobbyPending: state.externalLobbyPending,
      externalCancellationPending: state.externalCancellationPending,
      cancellationClosed: state.cancellationClosed,
      continuation: state.continuation,
      dotaLobby: state.dotaLobby,
      messages: messages.reverse().map((m) => ({
        id: Number(m.sequence),
        kind: m.kind === "USER" ? "user" : "system",
        text: m.body,
        time: time(m.createdAt.getTime()),
        ...(m.author
          ? {
              authorId: m.authorId!,
              author: m.author.displayName ?? m.author.username,
              avatar: resolveDisplayAvatar(m.author) ?? undefined,
              staffRole: authorRoles.get(m.authorId!),
            }
          : {}),
      })),
    };
  };
  return transaction
    ? read(transaction)
    : db.$transaction(read, { isolationLevel: "RepeatableRead" });
}
export const competitiveCommands = [
  "releaseContinuation",
  "prepare",
  "captain",
  "replaceCaptain",
  "setFirstPickGame",
  "configure",
  "kick",
  "pick",
  "roll",
  "choose",
  "start",
  "confirmReady",
  "voteCancel",
  "expireReadyCheck",
  "chat",
  "proposeBalance",
  "applyBalance",
  "cancelBalance",
];
export async function competitiveAction(
  userId: string,
  roomId: string,
  input: unknown,
  db = prisma,
) {
  const value = objectInput(input, [
    "action",
    "targetId",
    "team",
    "game",
    "formation",
    "text",
    "move",
    "roundId",
    "attemptId",
    "expectedRevision",
    "requestId",
  ]);
  if (!competitiveCommands.includes(String(value.action)))
    throw new AccountError("Acción inválida.");
  if (
    typeof value.requestId !== "string" ||
    !/^[a-zA-Z0-9-]{16,64}$/.test(value.requestId)
  )
    throw new AccountError("Identificador de acción requerido.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  await db.$transaction(
    async (tx) => {
      await lock(tx, roomId);
      const replay = await tx.roomEvent.findFirst({
        where: {
          roomId,
          actorId: userId,
          payload: { path: ["requestId"], equals: value.requestId as string },
        },
      });
      if (replay) {
        if (
          (replay.payload as { fingerprint: string }).fingerprint !==
          fingerprint
        )
          throw new AccountError(
            "Identificador reutilizado con otra acción.",
            409,
          );
        return;
      }
      await advance(tx, roomId, Date.now());
      const loaded = await load(tx, roomId);
      const { room, state, cp, draft } = loaded;
      if (value.action === "releaseContinuation") {
        if (room.creatorId !== userId)
          throw new AccountError(
            "Solo el creador puede cancelar la continuación.",
            403,
          );
        if (room.phase !== "READY")
          throw new AccountError(
            "Espera el cierre seguro del intento antes de cancelar la continuación.",
            409,
          );
        await assertPreviousLobbyClosed(tx, roomId);
        await releaseContinuation(tx, roomId);
        const updated = await tx.room.update({
          where: { id: roomId },
          data: { revision: { increment: 1 } },
        });
        await tx.roomEvent.create({
          data: {
            roomId,
            revision: updated.revision,
            actorId: userId,
            type: "CONTINUATION_RELEASED",
            payload: {
              reason: "EXPLICIT_POOL_SELECTION",
              requestId: value.requestId as string,
              fingerprint,
            },
          },
        });
        return;
      }
      if (value.action === "chat")
        await assertParticipation(tx, [userId], "CHAT");
      if (value.action === "voteCancel" && state.attempt) {
        // Same durable fence as the worker: after a SEND, local cancellation cannot
        // assert that the external match stopped. Reconciliation is required.
        state.externalCancellationPending = await dotaCancellationProtected(
          tx,
          state.attempt.id,
        );
      }
      if (value.action === "start") {
        await assertCompetitiveMmr(
          tx,
          room.members.filter((m) => m.team !== "BENCH").map((m) => m.userId),
        );
        const blocker = competitiveRoomBlocker(room.mode, room.region);
        if (blocker) throw new AccountError(blocker, 409);
      }
      if (value.action === "start")
        await assertParticipation(
          tx,
          room.members.filter((m) => m.team !== "BENCH").map((m) => m.userId),
        );
      if (value.action === "confirmReady")
        await assertParticipation(tx, [userId]);
      if (
        [
          "prepare",
          "captain",
          "replaceCaptain",
          "pick",
          "roll",
          "choose",
          "configure",
          "setFirstPickGame",
          "proposeBalance",
          "applyBalance",
        ].includes(String(value.action))
      )
        await assertParticipation(tx, [
          ...new Set([
            userId,
            ...(typeof value.targetId === "string" ? [value.targetId] : []),
            ...(value.action === "applyBalance"
              ? room.members.map((m) => m.userId)
              : []),
          ]),
        ]);
      if (!room.members.some((m) => m.userId === userId))
        throw new AccountError("Entra a la sala primero.", 403);
      if (
        ["CANCELLED", "FINISHED"].includes(room.phase) ||
        (["WAITING_FOR_PLAYERS", "IN_GAME"].includes(room.phase) &&
          !["chat", "voteCancel"].includes(String(value.action)))
      )
        throw new AccountError("Acción no disponible.", 409);
      // Ready/votes are commutative and tied to the frozen attempt, not roster revisions.
      if (
        !["chat", "confirmReady", "voteCancel", "expireReadyCheck"].includes(
          String(value.action),
        ) &&
        value.expectedRevision !== room.revision
      )
        throw new AccountError(
          "La sala cambió. Actualiza e intenta nuevamente.",
          409,
        );
      const now = Date.now();
      // Recover the missing captain without resetting the surviving captain,
      // teams, pick cursor or historical DraftPick after a presence departure.
      const surviving = room.members.filter(
        (m) => m.isCaptain && m.team !== "BENCH",
      );
      if (
        value.action === "captain" &&
        room.phase === "CHOOSING_CAPTAINS" &&
        surviving.length === 1 &&
        draft &&
        (await presenceInstalled(tx))
      ) {
        if (room.creatorId !== userId)
          throw new AccountError("Solo el creador selecciona al capitán.", 403);
        const target = room.members.find(
          (m) =>
            m.userId === value.targetId && m.team === "BENCH" && !m.isCaptain,
        );
        if (!target)
          throw new AccountError("Selecciona un jugador del banco.", 409);
        const team = surviving[0].team === "RADIANT" ? "DIRE" : "RADIANT";
        if (
          room.members.filter((m) => m.team === team).length >=
          roomFormat(room.mode).teamSize
        )
          throw new AccountError(
            "Libera una plaza del equipo antes de seleccionar capitán.",
            409,
          );
        await tx.roomMember.update({
          where: { roomId_userId: { roomId, userId: target.userId } },
          data: { isCaptain: true, team },
        });
        const full = (["RADIANT", "DIRE"] as const).every(
          (side) =>
            room.members.filter((m) => m.team === side).length +
              (team === side ? 1 : 0) ===
            roomFormat(room.mode).teamSize,
        );
        const phase = draft.firstPickSide
          ? draft.pickCursor < (draft.pickOrder as unknown[]).length
            ? "DRAFTING"
            : full
              ? "READY"
              : "WAITING"
          : "DECIDING_FIRST_PICK";
        const nextCheckpoint = {
          ...cp,
          ...(phase === "DRAFTING"
            ? {
                draftTurn: {
                  pick: draft.pickCursor,
                  startedAt: now,
                  expiresAt: now + roomConfig.draftTurnDurationMs,
                },
              }
            : {}),
        };
        await tx.room.update({ where: { id: roomId }, data: { phase } });
        await event(
          tx,
          roomId,
          userId,
          room.revision + 1,
          nextCheckpoint,
          "captain",
          value.requestId as string,
          fingerprint,
          { from: room.phase, to: phase },
        );
        await tx.roomMessage.create({
          data: {
            roomId,
            kind: "SYSTEM",
            body: `${target.user.displayName ?? target.user.username} es ahora capitán de ${team === "RADIANT" ? "Radiant" : "Dire"}. El draft anterior se conserva.`,
          },
        });
        return;
      }
      let action: Action;
      if (value.action === "chat")
        action = {
          type: "chat",
          text: plainText(value.text, "Mensaje", roomConfig.messageMaxLength),
        };
      else if (["captain", "kick", "pick"].includes(String(value.action)))
        action = {
          type: value.action as "captain" | "kick" | "pick",
          playerId: plainText(value.targetId, "Jugador", 128),
        };
      else if (value.action === "replaceCaptain") {
        if (!["radiant", "dire"].includes(String(value.team)))
          throw new AccountError("Equipo inválido.");
        action = {
          type: "replaceCaptain",
          playerId: plainText(value.targetId, "Jugador", 128),
          team: value.team as Team,
        };
      } else if (value.action === "configure")
        action = {
          type: "configure",
          formation: value.formation as "automatic" | "captains",
          game: value.game as LobbyState["game"],
        };
      else if (value.action === "setFirstPickGame")
        action = {
          type: "setFirstPickGame",
          game: value.game as LobbyState["game"],
        };
      else if (value.action === "voteCancel") {
        if (value.attemptId !== state.attempt?.id)
          throw new AccountError("Intento incorrecto.", 409);
        action = { type: "voteCancel", attemptId: value.attemptId as string };
      } else if (value.action === "roll" || value.action === "choose") {
        if (value.roundId !== cp.roundId)
          throw new AccountError("La ronda cambió.", 409);
        const team =
          state.captains?.radiant === userId
            ? "radiant"
            : state.captains?.dire === userId
              ? "dire"
              : null;
        if (!team || room.phase !== "DECIDING_FIRST_PICK")
          throw new AccountError(
            "Solo el capitán puede participar en esta ronda.",
            403,
          );
        if (value.action === "choose") {
          if (
            !["rock", "paper", "scissors"].includes(String(value.move)) ||
            cp.sealed[team]
          )
            throw new AccountError("Elección inválida o ya sellada.", 409);
          state.reveal = null;
          cp.sealed[team] = value.move as Move;
          action = { type: "confirmChoice" };
        } else {
          const range = getRollRange(state.game);
          action = { type: "roll", value: randomInt(range.min, range.max + 1) };
        }
      } else action = { type: value.action } as Action;
      if (
        ["confirmReady", "expireReadyCheck"].includes(action.type) &&
        value.attemptId !== state.attempt?.id
      )
        throw new AccountError("Intento incorrecto.", 409);
      if (
        action.type === "kick" &&
        ![
          "WAITING",
          "CHOOSING_CAPTAINS",
          "DECIDING_FIRST_PICK",
          "DRAFTING",
          "READY",
        ].includes(room.phase)
      )
        throw new AccountError("El roster está congelado.", 409);
      if (
        action.type === "pick" &&
        (!draft ||
          draft.pickCursor >= (draft.pickOrder as unknown[]).length ||
          (await tx.draftPick.findUnique({
            where: {
              draftId_playerId: {
                draftId: draft.id,
                playerId: action.playerId,
              },
            },
          })))
      )
        throw new AccountError(
          "Selección ya registrada o draft completo.",
          409,
        );
      if (action.type === "configure" && draft)
        throw new AccountError(
          "No cambies la formación de un draft ya iniciado.",
          409,
        );
      if (
        action.type === "start" &&
        roomFormat(room.mode).playerDraft &&
        room.formation === "CAPTAINS" &&
        (!draft ||
          draft.status !== "COMPLETE" ||
          draft.pickCursor !== (draft.pickOrder as unknown[]).length)
      )
        throw new AccountError("Completa el draft primero.", 409);
      let next: LobbyState;
      try {
        next = transitionLobby(state, action, userId, time(now), now);
      } catch (error) {
        throw new AccountError((error as Error).message, 409);
      }
      if (
        action.type === "pick" &&
        next.phase === "READY" &&
        next.pick !== state.pickOrder!.length
      )
        throw new AccountError(
          "El roster cambió antes de completar las selecciones.",
          409,
        );
      if (action.type === "roll" || action.type === "confirmChoice")
        next.firstPickStarted = true;
      if (
        action.type === "kick" &&
        draft?.status === "COMPLETE" &&
        next.captains &&
        next.phase === "DRAFTING"
      )
        next.phase = "WAITING";
      if (action.type === "applyBalance" && state.captains) {
        const radiant = next.radiant.filter((p) =>
          Object.values(state.captains!).includes(p.id),
        );
        const dire = next.dire.filter((p) =>
          Object.values(state.captains!).includes(p.id),
        );
        if (radiant.length !== 1 || dire.length !== 1)
          throw new AccountError(
            "El balance debe mantener un capitán en cada equipo.",
            409,
          );
        next.captains = { radiant: radiant[0].id, dire: dire[0].id };
      }
      if (
        action.type === "prepare" ||
        action.type === "setFirstPickGame" ||
        (action.type === "replaceCaptain" && !next.first)
      )
        Object.assign(cp, empty());
      if (
        action.type === "pick" &&
        next.pick === state.pickOrder!.length &&
        next.phase === "DRAFTING"
      )
        next.phase = "WAITING";
      if (
        action.type === "confirmReady" &&
        next.phase === "PREPARING" &&
        state.phase !== next.phase
      ) {
        const text = (await externalDotaEnabled(tx))
          ? "Todos listos. Preparando el lobby de Dota."
          : "Todos listos. Este entorno aislado termina en PREPARING; no contacta al bot.";
        next.messages = next.messages.map((message, index) =>
          index === next.messages.length - 1 ? { ...message, text } : message,
        );
      }
      if (
        action.type === "roll" &&
        !next.first &&
        !Object.keys(next.dice).length
      ) {
        cp.roundId = randomUUID();
        // Classic ties repeat automatically, on the server, for both captains.
        if (state.game === "dice")
          for (let round = 0; round < 100 && !next.first; round++) {
            for (const team of ["radiant", "dire"] as const)
              next = transitionLobby(
                next,
                {
                  type: "roll",
                  value: randomInt(roomConfig.diceMin, roomConfig.diceMax + 1),
                },
                state.captains![team],
                time(now),
                now,
              );
          }
      }
      await persist(
        tx,
        loaded,
        next,
        userId,
        action,
        cp,
        now,
        value.requestId as string,
        fingerprint,
      );
    },
    { timeout: 15000 },
  );
}
