import type { DotaLobby, LobbyState, Team } from "./engine";
import { roomConfig } from "./config";
import { finishLobbyMatch } from "./recognition";

export type DotaBotUpdate = DotaLobby & {
  attemptId: string;
  lobbySent?: boolean;
  gameStarted?: boolean;
  gameFinished?: boolean;
  winningTeam?: Team;
  durationSeconds?: number;
};

// Only a trusted bot supplies these lifecycle events. Ten connections are not
// proof that the game has started. An attempt ID rejects stale retry callbacks.
export function applyDotaBotUpdate(
  state: LobbyState,
  update: DotaBotUpdate,
  time: string,
  now = 0,
): LobbyState {
  if (!state.attempt || update.attemptId !== state.attempt.id)
    throw new Error("Aviso de un intento de partida distinto.");
  if (
    state.phase === "FINISHED" &&
    update.gameFinished &&
    state.completion?.id === update.attemptId
  ) {
    if (state.completion.winningTeam !== update.winningTeam)
      throw new Error("El resultado ya fue registrado.");
    return state;
  }
  if (
    !["PREPARING", "WAITING_FOR_PLAYERS", "IN_GAME"].includes(state.phase) ||
    state.readyCheck?.status !== "PASSED"
  )
    throw new Error(
      "Los jugadores deben completar el Ready Check antes de preparar Dota.",
    );
  const selected = [...state.radiant, ...state.dire].map((player) => player.id);
  if (
    state.radiant.length !== roomConfig.teamSize ||
    state.dire.length !== roomConfig.teamSize ||
    new Set(selected).size !== roomConfig.teamSize * 2
  )
    throw new Error("La composición 5v5 ya no está completa.");
  if (
    update.connectedPlayerIds &&
    (new Set(update.connectedPlayerIds).size !==
      update.connectedPlayerIds.length ||
      update.connectedPlayerIds.some((id) => !selected.includes(id)))
  )
    throw new Error("El bot informó un participante inválido.");
  const {
    attemptId: _attemptId,
    lobbySent,
    gameStarted,
    gameFinished,
    winningTeam,
    durationSeconds,
    ...info
  } = update;
  void _attemptId;
  const dotaLobby = { ...state.dotaLobby, ...info };
  if (lobbySent || info.lobbyId) dotaLobby.sentAt ??= now;
  let next: LobbyState = {
    ...state,
    dotaLobby,
    phase: state.phase === "IN_GAME" ? "IN_GAME" : "WAITING_FOR_PLAYERS",
  };
  const system = (text: string) => {
    next = {
      ...next,
      messages: [
        ...next.messages,
        { id: next.messages.length, kind: "system", text, time },
      ],
    };
  };
  if (state.dotaLobby?.sentAt === undefined && dotaLobby.sentAt !== undefined)
    system(
      "Lobby enviado. Si hay un problema antes del inicio, ocho jugadores pueden cancelar el intento.",
    );
  if (gameStarted && state.phase !== "IN_GAME") {
    if (dotaLobby.connectedPlayerIds?.length !== selected.length)
      throw new Error("Faltan conexiones verificadas para iniciar.");
    next = {
      ...next,
      phase: "IN_GAME",
      matchStartedAt: now,
      cancelVote: state.cancelVote,
      externalCancellationPending: true,
    };
    system("El bot confirmó el inicio real de la partida. Partida en vivo.");
  }
  if (gameFinished) {
    if (!winningTeam)
      throw new Error("El bot debe informar el equipo ganador.");
    next = finishLobbyMatch(next, now, winningTeam, durationSeconds);
    system("Partida finalizada. GG. Los Commends son opcionales.");
  }
  return next;
}
