import { roomFormat } from "./lobby-options.mjs";
import {
  allPlayers,
  currentPickTeam,
  getStartBlockers,
  type LobbyState,
} from "./engine";
import { firstPickMethods } from "./config";

export function getRoomStatus(state: LobbyState, actor: string, now: number) {
  const players = allPlayers(state);
  const name = (id?: string) =>
    players.find((player) => player.id === id)?.name ?? "Jugador";
  const team = currentPickTeam(state);
  const captainId = team ? state.captains?.[team] : undefined;
  const pending = state.invitations.find(
    (invite) => invite.status === "INVITED" && invite.purpose === "draft",
  );
  const highlight =
    state.highlight && now < state.highlight.expiresAt
      ? state.highlight
      : undefined;
  const ownTurn =
    state.phase === "DRAFTING" && captainId === actor && !pending && !highlight;
  const deadline = pending?.expiresAt ?? state.draftTurn?.expiresAt;
  const countdown =
    state.phase === "DRAFTING" && !highlight && deadline !== undefined
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : undefined;
  const reasons = getStartBlockers(state);
  if (highlight) {
    const title =
      highlight.kind === "first_pick"
        ? `${name(highlight.actorId)} ganó`
        : highlight.kind === "pick_confirmed"
          ? "Pick confirmado"
          : highlight.kind === "cancelled"
            ? "Partida cancelada"
            : "Equipos balanceados";
    const description =
      highlight.kind === "first_pick"
        ? `${highlight.team === "radiant" ? "Radiant" : "Dire"} obtiene el primer pick`
        : highlight.kind === "pick_confirmed"
          ? `${name(highlight.actorId)} seleccionó a ${name(highlight.playerId)} para ${highlight.team === "radiant" ? "Radiant" : "Dire"}`
          : highlight.kind === "cancelled"
            ? "Regresando a la sala. Los equipos y picks se conservan."
            : `Diferencia total${highlight.before! > highlight.after! ? " reducida" : ""}: ${highlight.before?.toLocaleString("en-US")} → ${highlight.after?.toLocaleString("en-US")} MMR`;
    return {
      kind: highlight.kind,
      title,
      description,
      ownTurn: false,
      captainId: highlight.actorId,
      countdown: undefined,
      key: `highlight-${highlight.createdAt}-${highlight.id}`,
    };
  }
  const title = state.balanceProposal
    ? "Propuesta de balance pendiente"
    : state.phase === "DRAFTING"
      ? ownTurn
        ? `Elige un jugador para ${team === "radiant" ? "Radiant" : "Dire"}`
        : `${name(captainId)} está eligiendo`
      : state.phase === "DECIDING_FIRST_PICK"
        ? "Decidiendo primer pick"
        : state.phase === "CHOOSING_CAPTAINS"
          ? "Elige al capitán rival"
          : state.phase === "READY"
            ? reasons.length
              ? "Antes de iniciar"
              : "Equipos completos"
            : state.phase === "READY_CHECK"
              ? "Confirma que estás listo"
              : state.phase === "PREPARING"
                ? "Preparando partida"
                : state.phase === "WAITING_FOR_PLAYERS"
                  ? state.cancelVote?.status === "OPEN"
                    ? "Votación para cancelar"
                    : "Lobby enviado · esperando inicio"
                  : state.phase === "IN_GAME"
                    ? state.dotaLobby?.productStatus === "STARTED"
                      ? "Partida en vivo"
                      : "Verificando inicio"
                    : state.phase === "FINISHED"
                      ? "Partida terminada"
                      : "Preparando equipos";
  const description = state.balanceProposal
    ? "Revisa los intercambios. Solo el creador puede aplicar el balance."
    : state.phase === "DRAFTING"
      ? `${team?.toUpperCase()} · PICK ${team ? Math.min(state[team].length + 1, roomFormat(state.mode).teamSize) : 0}/${roomFormat(state.mode).teamSize}${countdown === 0 ? " · Tiempo agotado; esperando la selección del capitán." : ""}`
      : state.phase === "DECIDING_FIRST_PICK"
        ? `${name(state.captains?.radiant)} vs ${name(state.captains?.dire)} · ${firstPickMethods.find((method) => method.id === state.game)?.label}`
        : state.phase === "CHOOSING_CAPTAINS"
          ? "Selecciona quién liderará el otro equipo."
          : state.phase === "READY"
            ? reasons.join(" ") ||
              `Radiant ${roomFormat(state.mode).teamSize}/${roomFormat(state.mode).teamSize} · Dire ${roomFormat(state.mode).teamSize}/${roomFormat(state.mode).teamSize}. Todo está preparado para el Ready Check.`
            : state.phase === "READY_CHECK"
              ? `${state.readyCheck?.readyPlayerIds.length ?? 0} / ${roomFormat(state.mode).teamSize * 2} listos · equipos congelados`
              : state.phase === "PREPARING"
                ? "Todos confirmaron. Esperando la respuesta del bot de Dota."
                : state.phase === "WAITING_FOR_PLAYERS"
                  ? state.cancelVote?.status === "OPEN"
                    ? `${state.cancelVote.voterIds.length}/${roomFormat(state.mode).cancellationVotes} votos · Solo los participantes pueden votar.`
                    : "Las conexiones y el inicio de la partida son estados distintos. Esperando que el bot confirme el inicio real."
                  : state.phase === "IN_GAME"
                    ? "La composición sigue protegida. Conserva esta sala y el chat mientras se comprueba el estado de Dota 2."
                    : state.phase === "FINISHED"
                      ? "El encuentro ha terminado."
                      : state.formation === "captains"
                        ? "El creador es el primer capitán. Los demás esperan en el banco."
                        : "Asigna jugadores del banco para completar Radiant y Dire.";
  return {
    kind: state.balanceProposal ? "balancing" : state.phase.toLowerCase(),
    title,
    description,
    ownTurn,
    captainId,
    countdown,
    key: `${state.phase}-${state.pick}-${pending?.id ?? "turn"}-${!!state.balanceProposal}`,
  };
}
