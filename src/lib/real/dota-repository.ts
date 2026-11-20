import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import {
  enqueueCreate,
  enqueueCancel,
} from "../../../apps/dota-worker/queue.mjs";
import {
  botHealthEnabled,
  readBotCapacity,
  botsOfflineMessage,
} from "../../../apps/dota-worker/shared-health.mjs";
import { validSteamId } from "../../../apps/dota-worker/contracts.mjs";
import { teamProof } from "../../../apps/dota-worker/presence.mjs";
import { AccountError } from "./http";
import type { DotaLobby } from "../rooms/engine";
import {
  authorizeLaunch,
  bindLaunch,
  revokeLaunch,
  hasLaunchControl,
} from "../../../apps/dota-worker/launch-control.mjs";
import { newAttemptAutoLaunch } from "../../../apps/dota-worker/auto-launch-config.mjs";
import { roomFormat } from "../rooms/lobby-options.mjs";
import { roomAutomationBlocker } from "./room-automation-policy";
import { gameplayConfirmed } from "../dota-start-evidence";
import { cancellationSchedule } from "../cancellation-schedule";
import {
  scopeRequired,
  assertAttempt,
  authorizeReadyAttempt,
  competitiveAdmissionOpen,
} from "../../../apps/dota-worker/attempt-authorization.mjs";
type Tx = Prisma.TransactionClient;
export async function assertPreviousLobbyClosed(tx: Tx, roomId: string) {
  const pending = await tx.dotaLobby.findFirst({
    where: {
      match: { roomId },
      OR: [
        { state: { notIn: ["CLOSED", "CANCELLED", "FAILED"] } },
        {
          state: { not: "CLOSED" },
          launchControl: { is: { status: { in: ["DISPATCHED", "STARTED"] } } },
        },
        { terminalCleanup: { is: { status: { not: "CLOSED" } } } },
      ],
    },
    select: { id: true },
  });
  if (pending)
    throw new AccountError(
      "El intento anterior sigue en recuperación. Espera a que se confirme la limpieza del lobby.",
      409,
    );
}
async function technicalClock(tx: Tx, lobbyId: string) {
  const [clock] = await tx.$queryRaw<
    { fresh: boolean; confirmedMs: number | null; observedMs: number | null }[]
  >`SELECT
    COALESCE(w."heartbeatAt">now()-interval '30 seconds',false) AS fresh,
    (extract(epoch FROM l."gcConfirmedAt")*1000)::double precision AS "confirmedMs",
    (extract(epoch FROM l."lastObservedAt")*1000)::double precision AS "observedMs"
    FROM "DotaLobby" l LEFT JOIN "DotaWorker" w ON w.id=l."workerId" WHERE l.id=${lobbyId}::uuid`;
  return clock;
}
function executor(tx: Tx) {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*SELECT\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
        const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          sql,
          ...params,
        );
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: await tx.$executeRawUnsafe(sql, ...params) };
    },
  };
}
export async function externalDotaEnabled(tx: Tx) {
  const [target] = await tx.$queryRaw<
    { database: string; schema: string }[]
  >`SELECT current_database() AS database,current_schema() AS schema`;
  return (
    target.database !== "draftory_multiplayer_test" ||
    target.schema !== "draftory_multiplayer_test"
  );
}
export async function requireSteamRoster(
  tx: Tx,
  ids: string[],
  mode = "ALL_PICK",
) {
  if (!(await externalDotaEnabled(tx))) return;
  const format = roomFormat(mode);
  if (ids.length !== format.players)
    throw new AccountError(
      `Este formato requiere ${format.players} jugadores: ${format.teamSize} en Radiant y ${format.teamSize} en Dire.`,
      409,
    );
  const users = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { steamId: true },
  });
  if (
    users.length !== format.players ||
    users.some((u) => !validSteamId(u.steamId)) ||
    new Set(users.map((u) => u.steamId)).size !== format.players
  )
    throw new AccountError(
      "Todos los participantes necesitan una cuenta Steam vinculada válida antes de iniciar. La sala y los equipos se conservan.",
      409,
    );
}
export async function requireDotaAutomation(tx: Tx, mode: string) {
  if (!(await externalDotaEnabled(tx))) return;
  const blocker = roomAutomationBlocker(mode);
  if (blocker) throw new AccountError(blocker, 409);
  const generalAdmission =
    process.env.DRAFTORY_DOTA_PUBLIC_COMPETITIVE === "true" &&
    process.env.DRAFTORY_DOTA_ADMISSION === "ELIGIBLE_ROOMS";
  if (generalAdmission && !competitiveAdmissionOpen())
    throw new AccountError(
      "La admisión competitiva no está activa. La sala y los equipos se conservan.",
      503,
    );
  if (
    !generalAdmission &&
    botHealthEnabled() &&
    !(await readBotCapacity(executor(tx))).some(
      (b: { state: string }) => b.state === "HEALTHY",
    )
  )
    throw new AccountError(botsOfflineMessage, 503);
  const [capability] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT count(*)=2 AS ready FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='DotaLobby' AND column_name IN ('publicName','credentialsEnvelope')`;
  if (!capability.ready)
    throw new AccountError(
      "La preparación del lobby requiere la migración de nombres aprobada antes de iniciar un nuevo intento. La sala y los equipos se conservan.",
      409,
    );
}
export async function authorizeDotaLaunch(
  tx: Tx,
  matchId: string,
  actor: string,
) {
  if (!(await externalDotaEnabled(tx))) return;
  const scoped = await scopeRequired(executor(tx));
  // The attempt is created before an operator can bind its persistent ID.
  // Scoped consent is armed in the PASSED ReadyCheck transaction below.
  if (scoped) return;
  if (!scoped && process.env.DRAFTORY_ENABLE_DOTA_AUTO_LAUNCH !== "true")
    return;
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { players: { include: { user: { select: { steamId: true } } } } },
  });
  if (!scoped && !newAttemptAutoLaunch(match)) return;
  await authorizeLaunch(
    executor(tx),
    matchId,
    actor,
    match.players.map((p) => ({
      userId: p.userId,
      steamId: p.user.steamId,
      teamSide: p.teamSide,
      slot: p.slot,
    })),
    match.mode,
    match.region,
  );
}
export async function revokeDotaLaunch(tx: Tx, matchId: string) {
  if (await externalDotaEnabled(tx)) await revokeLaunch(executor(tx), matchId);
}
export async function dotaCancellationProtected(tx: Tx, matchId: string) {
  if (!(await hasLaunchControl(executor(tx)))) return false;
  const controls = await tx.$queryRaw<
    {
      status: string;
      launchRequestId: string | null;
      externalMatchId: string | null;
    }[]
  >`SELECT status,"launchRequestId","externalMatchId" FROM "DotaLaunchControl" WHERE "matchId"=${matchId} FOR UPDATE`;
  return controls.some(
    (c) =>
      c.status === "DISPATCHED" ||
      c.status === "STARTED" ||
      !!c.launchRequestId ||
      !!c.externalMatchId,
  );
}
export async function assertDotaCancellationSafe(tx: Tx, matchId: string) {
  if (await dotaCancellationProtected(tx, matchId))
    throw new AccountError(
      "Launch enviado o ambiguo. Reconciliar con el GC antes de cancelar.",
      409,
    );
}
export async function enqueueDotaAttempt(tx: Tx, matchId: string) {
  if (await externalDotaEnabled(tx)) {
    const attempt = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { mode: true },
    });
    const blocker = roomAutomationBlocker(attempt.mode);
    if (blocker) throw new AccountError(blocker, 409);
    await authorizeReadyAttempt(executor(tx), matchId);
    if (await scopeRequired(executor(tx))) {
      try {
        await assertAttempt(executor(tx), matchId);
      } catch {
        throw new AccountError(
          "Esta partida aún no está autorizada para la prueba. Espera la confirmación antes de continuar.",
          409,
        );
      }
      const match = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: {
          room: true,
          players: { include: { user: { select: { steamId: true } } } },
        },
      });
      await authorizeLaunch(
        executor(tx),
        matchId,
        match.room!.creatorId,
        match.players.map((p) => ({
          userId: p.userId,
          steamId: p.user.steamId,
          teamSide: p.teamSide,
          slot: p.slot,
        })),
        match.mode,
        match.region,
      );
    }
    const id = await enqueueCreate(executor(tx), matchId);
    if (
      (await scopeRequired(executor(tx))) ||
      process.env.DRAFTORY_ENABLE_DOTA_AUTO_LAUNCH === "true"
    ) {
      const lobby = await tx.dotaLobby.findUniqueOrThrow({
        where: { id },
        include: { players: true, match: true },
      });
      if (
        (await scopeRequired(executor(tx))) ||
        newAttemptAutoLaunch(lobby.match)
      )
        await bindLaunch(executor(tx), {
          id,
          matchId,
          mode: lobby.match.mode,
          region: lobby.match.region,
          players: lobby.players.map((p) => ({ ...p, teamSide: p.team })),
        });
    }
  }
}
export async function cancelDotaAttempt(tx: Tx, matchId: string) {
  if (process.env.DRAFTORY_ENABLE_PLAYER_CANCELLATION_RECOVERY === "true") {
    const approved = await tx.$queryRaw<
      { approved: boolean }[]
    >`SELECT "warningJournal"->'CANCELLATION_REQUEST'->>'state'='APPROVED' approved FROM "DotaLaunchControl" WHERE "matchId"=${matchId}`;
    if (approved[0]?.approved) {
      await enqueueCancel(executor(tx), matchId);
      return;
    }
  }
  await assertDotaCancellationSafe(tx, matchId);
  await revokeDotaLaunch(tx, matchId);
  if (await externalDotaEnabled(tx)) await enqueueCancel(executor(tx), matchId);
}
export async function dotaProductView(
  tx: Tx,
  matchId: string,
): Promise<DotaLobby | undefined> {
  const lobby = await tx.dotaLobby.findUnique({
    where: { matchId },
    include: { players: true, jobs: true, match: true },
  });
  if (!lobby || ["CANCELLED", "CLOSED"].includes(lobby.state)) return;
  const invited = lobby.jobs.filter(
    (j) => j.kind === "INVITE_PLAYERS" && j.status === "SUCCEEDED",
  );
  const connectedPlayerIds = lobby.players
    .filter((p) => p.observedAt)
    .map((p) => p.userId);
  const invitedPlayerIds = lobby.players
    .filter((p) =>
      invited.some(
        (j) => j.idempotencyKey === `invite:${lobby.id}:${p.userId}`,
      ),
    )
    .map((p) => p.userId);
  const launch = (await hasLaunchControl(executor(tx)))
    ? await tx.dotaLaunchControl.findUnique({ where: { matchId } })
    : null;
  const [terminalCapability] = await tx.$queryRaw<
    { present: string | null }[]
  >`SELECT to_regclass('"DotaTerminalCleanup"')::text present`;
  const terminal = terminalCapability.present
    ? (
        await tx.$queryRaw<
          { status: string }[]
        >`SELECT status FROM "DotaTerminalCleanup" WHERE "matchId"=${matchId}`
      )[0]
    : null;
  const playerCancelled =
    (
      launch?.warningJournal as {
        CANCELLATION_REQUEST?: { state?: string };
      } | null
    )?.CANCELLATION_REQUEST?.state === "APPROVED";
  const automationPhase: DotaLobby["automationPhase"] = playerCancelled
    ? "CANCELLING"
    : terminal?.status === "INTERVENTION_REQUIRED" ||
        lobby.jobs.some(
          (j) =>
            j.status === "RECONCILE" && j.errorCode === "ATTEMPTS_EXHAUSTED",
        )
      ? "INTERVENTION"
      : terminal && terminal.status !== "CLOSED"
        ? "FINALIZING"
        : lobby.state === "CANCELLING"
          ? "CANCELLING"
          : (launch?.warningJournal as Record<string, unknown> | null)
                ?.ROSTER_CONTROL
            ? "VERIFYING_ACCESS"
            : undefined;
  const clock = await technicalClock(tx, lobby.id);
  const heartbeatFresh = clock.fresh;
  const stale =
    lobby.state === "RECONCILING" ||
    lobby.lastObservedAt === null ||
    !heartbeatFresh;
  const previousProjection = lobby.match.roomId
    ? await tx.roomEvent.findFirst({
        where: {
          roomId: lobby.match.roomId,
          type: "DOTA_PROJECTION",
          payload: { path: ["matchId"], equals: matchId },
        },
        orderBy: { revision: "desc" },
      })
    : null;
  const previousPresence =
    (
      previousProjection?.payload as {
        everConnectedPlayerIds?: string[];
      } | null
    )?.everConnectedPlayerIds ?? [];
  const journal = launch?.warningJournal as {
    CANCELLATION_EXIT?: { state?: DotaLobby["recoveryState"]; at?: string };
    CANCELLATION_REQUEST?: { state?: string };
    CANCELLATION_RECONCILIATION?: {
      state?: string;
      attempts?: number;
      checkedAt?: string;
      nextAt?: string;
    };
    GC_DETAILS?: {
      code?: string;
      obtainedAt?: string;
      nextAt?: string;
      attempts?: number;
    };
  } | null;
  const cancellationRequested =
    ["REQUESTED", "APPROVED"].includes(
      journal?.CANCELLATION_REQUEST?.state ?? "",
    ) || lobby.state === "CANCELLING";
  const schedule = cancellationSchedule(
    journal?.CANCELLATION_RECONCILIATION,
    journal?.GC_DETAILS,
    heartbeatFresh,
  );
  const playerCancellationReason =
    journal?.CANCELLATION_EXIT?.state === "UNAVAILABLE_EXTERNAL_CONFLICT"
      ? "GC comunica una asociación externa incompatible. El bot conserva su reserva hasta resolverla."
      : journal?.CANCELLATION_EXIT?.state === "LEAVING_LOBBY"
        ? "Cancelación aprobada, sin ganador ni recompensas. El bot está saliendo de Dota 2."
        : "Cancelación aprobada, sin ganador ni recompensas. Recuperando la conexión y esperando una confirmación válida de salida; el bot conserva su reserva.";
  const cancelJob = lobby.jobs.find((j) => j.kind === "CANCEL_LOBBY");
  const recoveryState: DotaLobby["recoveryState"] = playerCancelled
    ? (journal?.CANCELLATION_EXIT?.state ?? "CANCELLATION_REQUESTED")
    : gameplayConfirmed(launch, launch?.externalMatchId ?? null, Date.now())
      ? "IN_GAME"
      : launch?.launchRequestId
        ? "LAUNCHING"
        : undefined;
  return {
    ...(recoveryState ? { recoveryState } : {}),
    ...(cancellationRequested
      ? {
          cancellationDiagnostic: {
            reason: playerCancelled
              ? playerCancellationReason
              : journal?.CANCELLATION_RECONCILIATION?.state ===
                  "ADMINISTRATIVE_READ_INCONCLUSIVE"
                ? "La consulta administrativa terminó sin prueba de cierre. GC no devolvió detalles terminales del Match ID ni un lobby correlacionado; El bot permanece protegido."
                : !heartbeatFresh
                  ? "El bot está desconectado. OWNER debe ejecutar una reconciliación administrativa de lectura; no se liberará la reserva sin evidencia terminal."
                  : journal?.CANCELLATION_RECONCILIATION?.state ===
                      "INTERVENTION_REQUIRED"
                    ? "Se agotaron las comprobaciones automáticas. OWNER debe obtener evidencia terminal correlacionada; los tiempos de espera no autorizan liberar el bot."
                    : terminal && terminal.status !== "CLOSED"
                      ? "El fin del intento está confirmado. El bot debe confirmar su salida y completar el recibo de limpieza."
                      : journal?.GC_DETAILS?.code === "NOT_AVAILABLE"
                        ? "GC no devuelve detalles del Match ID. Esto no demuestra su cierre; se necesita un resultado terminal correlacionado o un evento POSTGAME válido."
                        : "Solicitud registrada. Comprobando el estado externo antes de autorizar la salida; una partida activa no puede abortarse desde Draftory.",
            attempts: Math.max(
              0,
              Math.min(
                1000,
                Number(
                  playerCancelled
                    ? cancelJob?.attempts
                    : (journal?.CANCELLATION_RECONCILIATION?.attempts ??
                        journal?.GC_DETAILS?.attempts ??
                        0),
                ) || 0,
              ),
            ),
            lastCheckedAt: playerCancelled
              ? (journal?.CANCELLATION_EXIT?.at ?? null)
              : schedule.lastCheckedAt,
            nextCheckAt: playerCancelled
              ? (cancelJob?.availableAt.toISOString() ?? null)
              : schedule.nextCheckAt,
            requiresIntervention: playerCancelled
              ? false
              : schedule.requiresIntervention,
          },
        }
      : {}),
    progress: {
      invitationsSent: invitedPlayerIds.length,
      expected: roomFormat(lobby.match.mode).players,
    },
    productStatus:
      launch?.status === "STARTED"
        ? gameplayConfirmed(launch, launch.externalMatchId, Date.now())
          ? "STARTED"
          : "STARTING"
        : launch?.status === "DISPATCHED" &&
            (launch.warningJournal as Record<string, unknown> | null)
              ?.LAUNCH_SUBMITTED === true
          ? "STARTING"
          : ["FAILED", "CANCELLING"].includes(lobby.state) ||
              (lobby.state === "RECONCILING" && !lobby.lobbyId)
            ? "PROBLEM"
            : !lobby.lobbyId
              ? "PREPARING"
              : stale
                ? "RECONNECTING"
                : invitedPlayerIds.length < roomFormat(lobby.match.mode).players
                  ? "INVITING"
                  : "WAITING",
    automationPhase:
      automationPhase ??
      (lobby.state === "QUEUED" && !lobby.workerId
        ? "SEARCHING_BOT"
        : connectedPlayerIds.length === roomFormat(lobby.match.mode).players &&
            !teamProof(lobby.players, !stale, lobby.match.mode)
          ? "VERIFYING_TEAMS"
          : undefined),
    ...(lobby.lobbyId ? { lobbyId: lobby.lobbyId } : {}),
    sentAt: clock.confirmedMs ?? undefined,
    connectedPlayerIds,
    invitedPlayerIds,
    presenceFresh: !stale,
    teamsConfirmed: teamProof(lobby.players, !stale, lobby.match.mode),
    autoLaunchAuthorized: launch?.status === "ARMED",
    playerEvidence: lobby.players.map((p) => {
      const j = lobby.jobs.find(
        (j) =>
          j.kind === "INVITE_PLAYERS" &&
          j.idempotencyKey === `invite:${lobby.id}:${p.userId}`,
      );
      return {
        userId: p.userId,
        observedTeam: p.observedTeam,
        observedSlot: p.observedSlot,
        previouslyPresent: previousPresence.includes(p.userId),
        invitation:
          p.observedAt && !stale
            ? ("PRESENT" as const)
            : j?.status === "SUCCEEDED"
              ? ("SENT" as const)
              : j?.status === "LEASED"
                ? ("SENDING" as const)
                : j?.status === "FAILED"
                  ? ("FAILED" as const)
                  : j?.status === "RECONCILE" || j?.status === "CANCELLED"
                    ? ("UNKNOWN" as const)
                    : ("PENDING" as const),
      };
    }),
    observedAt:
      clock.observedMs === null
        ? undefined
        : new Date(clock.observedMs).toISOString(),
  };
}
// Web authority: caller holds Room lock. Worker cannot write Room/Match or insert jobs.
export async function projectDotaEvidence(tx: Tx, roomId: string) {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  if (["IN_GAME", "FINISHED", "READY"].includes(room.phase)) {
    const attempt = await tx.match.findFirst({
      where: { roomId },
      orderBy: { attemptNumber: "desc" },
    });
    if (!attempt) return;
    const view = await dotaProductView(tx, attempt.id);
    const key = createHash("sha256")
      .update(JSON.stringify(view ?? null))
      .digest("hex");
    const previous = await tx.roomEvent.findFirst({
      where: { roomId, type: "DOTA_LIFECYCLE_PROJECTION" },
      orderBy: { revision: "desc" },
    });
    if ((previous?.payload as { key?: string } | null)?.key !== key) {
      await tx.room.update({
        where: { id: roomId },
        data: { revision: { increment: 1 } },
      });
      await tx.roomEvent.create({
        data: {
          roomId,
          revision: room.revision + 1,
          type: "DOTA_LIFECYCLE_PROJECTION",
          payload: { key, matchId: attempt.id },
        },
      });
    }
    return;
  }
  if (!["PREPARING", "WAITING_FOR_PLAYERS"].includes(room.phase)) return;
  const match = await tx.match.findFirst({
    where: { roomId },
    orderBy: { attemptNumber: "desc" },
    include: { readyCheck: { include: { players: true } }, players: true },
  });
  if (
    !match ||
    match.status !== "QUEUED" ||
    match.readyCheck?.status !== "PASSED" ||
    match.readyCheck.players.length !== roomFormat(match.mode).players ||
    match.readyCheck.players.some((p) => !p.confirmedAt)
  )
    return;
  const lobby = await tx.dotaLobby.findUnique({
    where: { matchId: match.id },
    include: { players: true, jobs: true },
  });
  if (!lobby) return;
  let phase = room.phase;
  const launch = (await hasLaunchControl(executor(tx)))
    ? await tx.dotaLaunchControl.findUnique({ where: { matchId: match.id } })
    : null;
  if (
    launch?.status === "STARTED" &&
    launch.externalMatchId &&
    launch.startedObservedAt &&
    launch.lobbyId === lobby.id &&
    lobby.state === "CONFIRMED" &&
    lobby.lobbyId &&
    lobby.gcConfirmedAt &&
    launch.startedObservedAt >= lobby.gcConfirmedAt
  ) {
    const link = await tx.matchExternalLink.findUnique({
      where: { matchId: match.id },
    });
    if (link && link.dotaMatchId !== launch.externalMatchId)
      throw new AccountError("Evidencia de inicio incompatible.", 409);
    if (!link)
      await tx.matchExternalLink.create({
        data: {
          matchId: match.id,
          dotaMatchId: launch.externalMatchId,
          lobbyId: lobby.lobbyId,
          correlationId: lobby.correlationId,
          workerId: lobby.workerId!,
          observedAt: launch.startedObservedAt,
        },
      });
    // GC RUN + match_id proves allocation/running association, not exact game start time.
    // Leave startedAt null: prediction windows must not use this observation as match time.
    await tx.match.update({
      where: { id: match.id },
      data: {
        status: "IN_PROGRESS",
        dotaMatchId: launch.externalMatchId,
        revision: { increment: 1 },
      },
    });
    phase = "IN_GAME";
  }
  if (
    ["CONFIRMED", "RECONCILING"].includes(lobby.state) &&
    lobby.lobbyId &&
    lobby.gcConfirmedAt &&
    lobby.players.length === roomFormat(match.mode).players &&
    match.players.length === roomFormat(match.mode).players &&
    lobby.jobs.some(
      (j) => j.kind === "CREATE_LOBBY" && j.status === "SUCCEEDED",
    )
  ) {
    if (phase !== "IN_GAME") phase = "WAITING_FOR_PLAYERS";
    await tx.$executeRaw`UPDATE "Match" m SET "dotaLobbyId"=l."lobbyId",
      "lobbySentAt"=l."gcConfirmedAt" AT TIME ZONE 'UTC' FROM "DotaLobby" l
      WHERE m.id=${match.id} AND l.id=${lobby.id}::uuid`;
    // Queue timestamps come from PostgreSQL, never client-side @default(now()) serialization.
    if (phase !== "IN_GAME")
      for (const player of lobby.players)
        await tx.$executeRaw`INSERT INTO "DotaJob" (id,"lobbyId",kind,"idempotencyKey")
      VALUES (${randomUUID()}::uuid,${lobby.id}::uuid,'INVITE_PLAYERS',${`invite:${lobby.id}:${player.userId}`})
      ON CONFLICT ("idempotencyKey") DO NOTHING`;
  }
  const heartbeatFresh = (await technicalClock(tx, lobby.id)).fresh;
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        heartbeatFresh,
        state: lobby.state,
        id: lobby.lobbyId,
        at: lobby.lastObservedAt,
        launch: launch?.status,
        jobs: lobby.jobs.map((j) => [j.id, j.status]).sort(),
        players: lobby.players
          .map((p) => [p.userId, !!p.observedAt, p.observedTeam])
          .sort(),
      }),
    )
    .digest("hex");
  const previous = await tx.roomEvent.findFirst({
    where: { roomId, type: "DOTA_PROJECTION" },
    orderBy: { revision: "desc" },
  });
  if (
    (previous?.payload as { key?: string } | null)?.key === key &&
    phase === room.phase
  )
    return;
  await tx.room.update({
    where: { id: roomId },
    data: { phase, revision: { increment: 1 } },
  });
  const previousIds = previous?.payload as {
    matchId?: string;
    everConnectedPlayerIds?: string[];
  } | null;
  const everConnectedPlayerIds = [
    ...new Set([
      ...(previousIds?.matchId === match.id
        ? (previousIds.everConnectedPlayerIds ?? [])
        : []),
      ...lobby.players.filter((p) => p.observedAt).map((p) => p.userId),
    ]),
  ];
  await tx.roomEvent.create({
    data: {
      roomId,
      revision: room.revision + 1,
      type: "DOTA_PROJECTION",
      payload: { key, phase, matchId: match.id, everConnectedPlayerIds },
    },
  });
  if (phase !== room.phase)
    await tx.roomMessage.create({
      data: {
        roomId,
        kind: "SYSTEM",
        body:
          phase === "IN_GAME"
            ? "Servidor de Dota 2 asociado. Verificando el inicio real; conserva esta sala y el chat."
            : "Lobby de Dota confirmado. Se están enviando las invitaciones a los participantes autorizados.",
      },
    });
}
