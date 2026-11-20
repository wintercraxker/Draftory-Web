import { roomFormat } from "./lobby-options.mjs";
import type { LobbyState, Team } from "./engine";

export function dotaParticipantState(
  state: LobbyState,
  id: string,
  team: Team,
) {
  const lobby = state.dotaLobby,
    evidence = lobby?.playerEvidence?.find((p) => p.userId === id);
  const seen = lobby?.connectedPlayerIds?.includes(id) === true;
  const fresh = lobby?.presenceFresh === true;
  const expected = team === "radiant" ? "RADIANT" : "DIRE";
  if (seen && evidence?.observedTeam && evidence.observedTeam !== expected)
    return {
      kind: "wrong",
      label: "Equipo incorrecto",
      detail: `${fresh ? "" : "Última observación: "}cambia a ${team === "radiant" ? "Radiant" : "Dire"} en Dota 2.`,
      connected: fresh,
      verified: false,
    } as const;
  if (seen && !fresh)
    return {
      kind: "unknown",
      label: "Revalidando conexión",
      detail: "La última presencia necesita confirmación.",
      connected: false,
      verified: false,
    } as const;
  if (seen && fresh && evidence?.observedTeam === expected)
    return {
      kind: "verified",
      label: "Equipo verificado",
      detail: `En ${team === "radiant" ? "Radiant" : "Dire"}.`,
      connected: true,
      verified: true,
    } as const;
  if (seen && fresh)
    return {
      kind: "unknown",
      label: "Equipo sin verificar",
      detail: "En el lobby. Elige tu equipo en Dota 2.",
      connected: true,
      verified: false,
    } as const;
  if (fresh && evidence?.previouslyPresent)
    return {
      kind: "disconnected",
      label: "Desconectado",
      detail: "Vuelve a entrar al lobby de Dota 2.",
      connected: false,
      verified: false,
    } as const;
  const label =
    evidence?.invitation === "SENT"
      ? "Esperando ingreso"
      : evidence?.invitation === "SENDING"
        ? "Invitación solicitada"
        : evidence?.invitation === "FAILED"
          ? "Invitación no confirmada"
          : evidence?.invitation === "UNKNOWN"
            ? "Invitación sin confirmar"
            : "Esperando invitación";
  return {
    kind: "waiting",
    label,
    detail:
      evidence?.invitation === "SENT"
        ? "Invitación enviada; la recepción no está confirmada."
        : "Puedes usar el acceso manual cuando el lobby esté preparado.",
    connected: false,
    verified: false,
  } as const;
}
export function dotaPreparationView(state: LobbyState) {
  const format = roomFormat(state.mode),
    lobby = state.dotaLobby;
  const players = (["radiant", "dire"] as const).flatMap((team) =>
    state[team].map((p) => dotaParticipantState(state, p.id, team)),
  );
  const connected = players.filter((p) => p.connected).length,
    verified = players.filter((p) => p.verified).length;
  const allVerified =
    lobby?.presenceFresh === true &&
    lobby.teamsConfirmed === true &&
    connected === format.players &&
    verified === format.players &&
    state.radiant.length === format.teamSize &&
    state.dire.length === format.teamSize;
  const stage =
    (state.cancelVote?.status === "PASSED" &&
      state.externalCancellationPending) ||
    !!lobby?.cancellationDiagnostic ||
    lobby?.automationPhase === "CANCELLING"
      ? "cancelling"
      : state.phase === "FINISHED"
        ? "result"
        : lobby?.productStatus === "STARTED"
          ? "playing"
          : lobby?.productStatus === "STARTING" || state.phase === "IN_GAME"
            ? "starting"
            : state.phase === "PREPARING" || !lobby?.lobbyId
              ? "preparing"
              : allVerified
                ? "complete"
                : "waiting";
  const titles = {
    cancelling: "Cancelación solicitada",
    result: state.completion
      ? "Partida finalizada"
      : "Esperando confirmación del resultado",
    playing:
      lobby?.presenceFresh === true
        ? "Partida en curso"
        : "Resultado pendiente de verificación",
    starting: "Verificando inicio",
    preparing: "Preparando partida",
    complete: "Todos en sus equipos",
    waiting: "Esperando jugadores",
  };
  const subtitles = {
    cancelling:
      "Esperando confirmación de cierre. Todavía no puedes reiniciar.",
    result: state.completion
      ? "Consulta el resultado y los reconocimientos de esta partida."
      : "El resultado todavía no ha sido verificado.",
    playing:
      lobby?.presenceFresh === true
        ? "La partida está en curso. Sigue en contacto con tu equipo."
        : "El inicio fue confirmado por GC. El seguimiento actual no está disponible; esto no demuestra que la partida haya finalizado.",
    starting: "Esperando la confirmación real de inicio.",
    preparing: "Todos confirmaron. Estamos preparando tu lobby de Dota 2.",
    complete: "Los jugadores están preparados para comenzar.",
    waiting: "El lobby de Dota 2 está preparado. Esperando que todos ingresen.",
  };
  return {
    stage,
    title:
      lobby?.automationPhase === "INTERVENTION" && stage === "starting"
        ? "Recuperación pendiente"
        : stage === "preparing" && lobby?.automationPhase === "SEARCHING_BOT"
          ? "Buscando bot disponible"
          : titles[stage],
    subtitle:
      stage === "preparing" && lobby?.automationPhase === "SEARCHING_BOT"
        ? "Todos confirmaron. Tu partida espera capacidad disponible sin repetir ReadyCheck."
        : subtitles[stage],
    expected: format.players,
    teamSize: format.teamSize,
    connected,
    verified,
    allVerified,
  };
}

// Evidence milestones, not an estimated progress percentage or a second Ready Check.
export function dotaPreparationMilestones(state: LobbyState) {
  const view = dotaPreparationView(state),
    lobby = state.dotaLobby;
  const done = [
    state.readyCheck?.status === "PASSED",
    !!lobby?.lobbyId &&
      ["INVITING", "WAITING", "RECONNECTING", "STARTING", "STARTED"].includes(
        lobby.productStatus ?? "",
      ),
    lobby?.presenceFresh === true && view.connected === view.expected,
    view.allVerified,
    lobby?.productStatus === "STARTED",
  ];
  const current = done.findIndex((value) => !value);
  return ["Confirmación", "Lobby Dota 2", "Ingreso", "Equipos", "Partida"].map(
    (label, index) =>
      ({
        label,
        status: done[index]
          ? "done"
          : index === current
            ? "current"
            : "pending",
      }) as const,
  );
}
