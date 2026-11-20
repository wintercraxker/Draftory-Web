import { PlayerDisplayName } from "../players/PlayerDisplayName";
import type { ReactNode } from "react";
import { Check, Clock, Play, Crown } from "lucide-react";
import { DashboardButton } from "./DashboardUi";
import {
  allPlayers,
  getStartBlockers,
  type Action,
  type LobbyState,
  type Team,
} from "@/lib/rooms/engine";
import { getRoomStatus } from "@/lib/rooms/presentation";
import type { Player } from "@/lib/competitive";
import { PlayerAvatar } from "./PlayerIdentity";

const captions = {
  WAITING: "Sala abierta",
  CHOOSING_CAPTAINS: "Capitanes",
  DECIDING_FIRST_PICK: "Primer pick",
  DRAFTING: "Draft en curso",
  READY: "Equipos completos",
  READY_CHECK: "Ready Check",
  PREPARING: "Preparando partida",
  WAITING_FOR_PLAYERS: "Lobby de Dota",
  IN_GAME: "En vivo",
  FINISHED: "Finalizada",
};

export function RoomStatusBanner({
  state,
  actor,
  now = 0,
  onAction,
  onConfigure,
  children,
  selection,
  onConfirmPick,
  onCancelPick,
  notice,
  tools,
  onCaptainSelection = false,
  onCancelCaptainSelection,
  competitivePending = false,
  startBlocker,
}: {
  state: LobbyState;
  actor: string;
  now?: number;
  onAction: (action: Action) => void;
  onConfigure: () => void;
  children?: ReactNode;
  selection?: { player: Player; team: Team };
  onConfirmPick?: () => void;
  onCancelPick?: () => void;
  notice?: string;
  tools?: ReactNode;
  onCaptainSelection?: boolean;
  onCancelCaptainSelection?: () => void;
  competitivePending?: boolean;
  startBlocker?: string;
}) {
  const status = getRoomStatus(state, actor, now);
  const isHost = actor === state.hostId;
  const players = allPlayers(state);
  const captain = players.find((player) => player.id === status.captainId);
  const pending = state.invitations.some(
    (invite) => invite.status === "INVITED",
  );
  const prepare =
    state.phase === "WAITING" &&
    (!state.captains ||
      (competitivePending &&
        (!state.captains.radiant || !state.captains.dire))) &&
    isHost &&
    state.formation === "captains" &&
    players.length >= 2 &&
    !pending;
  const confirmed = [
    "first_pick",
    "pick_confirmed",
    "balanced",
    "cancelled",
  ].includes(status.kind);
  return (
    <section
      className={`room-status-banner lobby-phase-bar ${status.ownTurn ? "room-status-own-turn" : ""}`}
      aria-label="Estado de la sala"
    >
      <div key={status.key} className="room-status-line">
        <div className="room-status-identity">
          {captain && (
            <PlayerAvatar player={captain} className="room-status-avatar" />
          )}
          <div className="min-w-0">
            <p className="room-status-caption">
              {state.phase === "CHOOSING_CAPTAINS" ? (
                <Crown size={12} />
              ) : confirmed || state.phase === "READY" ? (
                <Check size={12} />
              ) : (
                <span
                  className={`room-status-dot ${status.ownTurn || state.phase === "DRAFTING" ? "room-status-dot-active" : ""}`}
                />
              )}
              {onCaptainSelection &&
              state.phase === "CHOOSING_CAPTAINS" &&
              isHost
                ? "Seleccionando capitán"
                : status.ownTurn
                  ? "Tu turno"
                  : confirmed
                    ? "Confirmado"
                    : captions[state.phase]}
            </p>
            <h2 aria-live="polite" className="room-status-title">
              {status.title}
            </h2>
            <p className="room-status-description">
              {onCaptainSelection &&
              state.phase === "CHOOSING_CAPTAINS" &&
              isHost
                ? "Haz clic en un jugador del banco para liderar el otro equipo."
                : status.description}
            </p>
            {state.phase === "CHOOSING_CAPTAINS" && (
              <p className="captain-owner-note">
                {players.find((player) => player.id === state.hostId)?.name} ·
                Creador · Capitán de{" "}
                {state.radiant.some((player) => player.id === state.hostId)
                  ? "Radiant"
                  : "Dire"}
              </p>
            )}
          </div>
        </div>
        <div className="room-status-actions">
          {status.countdown !== undefined && (
            <div
              className={`room-status-timer ${status.countdown <= 10 ? "room-timer-warning" : ""}`}
              aria-label="Tiempo de pick"
            >
              <Clock size={13} />
              <span>
                {String(Math.floor(status.countdown / 60)).padStart(2, "0")}:
                {String(status.countdown % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          {prepare && (
            <DashboardButton
              variant="primary"
              disabled={competitivePending}
              title={
                competitivePending
                  ? "Capitanes: pendiente de conectar"
                  : undefined
              }
              onClick={() => onAction({ type: "prepare" })}
            >
              <Crown size={13} />
              Elegir capitán
            </DashboardButton>
          )}
          {state.phase === "CHOOSING_CAPTAINS" && isHost && (
            <DashboardButton
              disabled={competitivePending}
              variant={onCaptainSelection ? "ghost" : "primary"}
              onClick={
                onCaptainSelection ? onCancelCaptainSelection : onConfigure
              }
            >
              {onCaptainSelection ? "Cancelar selección" : "Elegir capitán →"}
            </DashboardButton>
          )}
          {state.phase === "READY" && isHost && !confirmed && (
            <DashboardButton
              variant="primary"
              size="md"
              disabled={
                competitivePending ||
                !!startBlocker ||
                getStartBlockers(state).length > 0
              }
              title={startBlocker}
              aria-describedby={
                startBlocker ? "room-automation-note" : undefined
              }
              onClick={() => onAction({ type: "start" })}
            >
              <Play size={14} />
              {state.continuation?.state === "RESERVED"
                ? "Volver a iniciar partida"
                : "Iniciar partida"}
            </DashboardButton>
          )}
          {tools}
        </div>
      </div>
      {competitivePending && (
        <p className="mt-3 text-xs text-zinc-500">
          Capitanes, draft y ready check pendientes de conectar. Puedes
          organizar equipos y cambiar tu rol.
        </p>
      )}
      {startBlocker && state.phase === "READY" && (
        <p id="room-automation-note" className="mt-3 text-xs text-zinc-400">
          {startBlocker}
        </p>
      )}
      {children}
      {selection && status.ownTurn && (
        <div className="room-pick-confirmation">
          <p>
            ¿Seleccionar a{" "}
            <strong>
              <PlayerDisplayName
                id={selection.player.id}
                name={selection.player.name}
              />
            </strong>{" "}
            para{" "}
            <strong>{selection.team === "radiant" ? "Radiant" : "Dire"}</strong>
            ?<span>El jugador se incorporará directamente al equipo.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="dashboard-button px-3 py-2 text-xs"
              onClick={onCancelPick}
            >
              Cancelar
            </button>
            <button
              className="dashboard-primary-button"
              onClick={onConfirmPick}
            >
              Confirmar pick
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs leading-5 text-amber-200">
          {notice}
        </p>
      )}
    </section>
  );
}

// Preserve the existing component entry point while giving the banner a public name.
export { RoomStatusBanner as RoomPhaseBar };
