"use client";
import { DashboardDropdown } from "./Dropdown";

import { X } from "lucide-react";
import {
  allPlayers,
  canProposeBalance,
  type Action,
  type LobbyState,
  type Team,
} from "@/lib/rooms/engine";
import { roomFormat } from "@/lib/rooms/lobby-options.mjs";
import { firstPickMethods } from "@/lib/rooms/config";
import type { DemoRoomAction } from "@/lib/rooms/demo";
import { DashboardDialog } from "./DashboardDialog";
import { RoomPrivacy } from "./RoomPrivacy";

const button = "dashboard-button px-3 py-2 text-xs disabled:opacity-40";

export function ReadyDemoActions({
  onDemo,
}: {
  onDemo: (action: DemoRoomAction) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button className={button} onClick={() => onDemo("allReady")}>
        Marcar todos listos
      </button>
      <button className={button} onClick={() => onDemo("nextReady")}>
        Confirmar siguiente jugador
      </button>
    </div>
  );
}

export function RoomConfiguration({
  state,
  actor,
  onAction,
  onClose,
  isPrivate = false,
  onPrivacy,
  pending = false,
}: {
  state: LobbyState;
  actor: string;
  onAction: (action: Action) => void;
  onClose: () => void;
  isPrivate?: boolean;
  onPrivacy?: (privateRoom: boolean, password?: string) => Promise<void>;
  pending?: boolean;
}) {
  if (actor !== state.hostId) return null;
  const invitationsPending = state.invitations.some(
    (invite) => invite.status === "INVITED",
  );
  const editable =
    state.phase === "WAITING" &&
    !state.captains &&
    !state.first &&
    !invitationsPending &&
    !pending;

  return (
    <DashboardDialog titleId="room-config-title" onClose={onClose}>
      <div className="dashboard-panel dashboard-form p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="room-config-title" className="dashboard-section-title">
            Configuración de sala
          </h2>
          <button
            className={button}
            aria-label="Cerrar configuración"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {(onPrivacy || pending) && !["FINISHED"].includes(state.phase) && (
            <RoomPrivacy
              disabled={pending}
              isPrivate={isPrivate}
              onSave={onPrivacy ?? (async () => {})}
            />
          )}
          {pending && (
            <p role="status" className="text-xs text-zinc-400">
              Cambiar configuración, capitanes, balance y contraseña: pendientes
              de conectar. La organización de jugadores ya se guarda en
              PostgreSQL.
            </p>
          )}
          <label className="block text-xs">
            Formación
            <DashboardDropdown
              label={"Formación"}
              options={[
                { value: "captains", label: "Capitanes / Draft manual" },
                { value: "automatic", label: "Asignación directa" },
              ]}
              className="dashboard-dropdown-field mt-2 w-full"
              disabled={!editable || !roomFormat(state.mode).playerDraft}
              value={state.formation}
              onChange={(value) =>
                onAction({
                  type: "configure",
                  formation: value as LobbyState["formation"],
                  game: state.game,
                })
              }
            />
          </label>
          {state.formation === "captains" && (
            <>
              <label className="block text-xs">
                Método para primer pick
                <DashboardDropdown
                  label={"Método para primer pick"}
                  options={[
                    ...firstPickMethods.map((method) => ({
                      value: method.id,
                      label: method.label,
                    })),
                  ]}
                  className="dashboard-dropdown-field mt-2 w-full"
                  disabled={!editable}
                  value={state.game}
                  onChange={(value) =>
                    onAction({
                      type: "configure",
                      formation: state.formation,
                      game: value as LobbyState["game"],
                    })
                  }
                />
              </label>
              <p className="text-xs leading-5 text-zinc-400">
                Designa al segundo capitán desde la barra de estado, haciendo
                clic en su tarjeta del banco. La asignación es inmediata.
              </p>
            </>
          )}
          {roomFormat(state.mode).playerDraft && (
            <div className="border-t border-zinc-800 pt-4">
              <p className="dashboard-label">Equilibrado</p>
              <p className="my-3 text-xs leading-5 text-zinc-500">
                El balance redistribuye únicamente los diez jugadores
                confirmados. El creador revisa y confirma la propuesta.
              </p>
              {canProposeBalance(state, actor) ? (
                <button
                  className={button}
                  disabled={pending || !!state.balanceProposal}
                  onClick={() => {
                    onAction({ type: "proposeBalance" });
                    onClose();
                  }}
                >
                  Equilibrar por MMR
                </button>
              ) : (
                <p className="text-xs text-zinc-600">
                  {state.phase !== "READY"
                    ? "Disponible antes del Ready Check, con la sala preparada."
                    : state.radiant.length !== 5 || state.dire.length !== 5
                      ? "Requiere cinco jugadores en Radiant y cinco en Dire."
                      : "Requiere MMR operativo positivo de los diez jugadores y permisos de creador o capitán."}
                </p>
              )}
            </div>
          )}
          {!editable && (
            <p role="status" className="text-xs text-zinc-500">
              La formación y el método están bloqueados durante esta fase.
            </p>
          )}
        </div>
      </div>
    </DashboardDialog>
  );
}

export function RoomDemoTools({
  state,
  actor,
  onActor,
  onDemo,
  onFinish,
  onClose,
  onLifecycle,
}: {
  state: LobbyState;
  actor: string;
  onActor: (id: string) => void;
  onDemo: (action: DemoRoomAction) => void;
  onFinish: (winningTeam: Team) => void;
  onClose: () => void;
  onLifecycle?: (
    event: "lobbySent" | "gameStarted" | "gameFinished",
    winningTeam?: Team,
  ) => void;
}) {
  const isHost = actor === state.hostId;
  const locked = [
    "READY_CHECK",
    "PREPARING",
    "WAITING_FOR_PLAYERS",
    "IN_GAME",
    "FINISHED",
  ].includes(state.phase);
  const actions = [
    { id: "addPlayer", label: "Añadir jugador demo" },
    { id: "fillBench", label: "Rellenar sala demo" },
    { id: "fill5v5", label: "Rellenar 5v5 demo" },
    { id: "clearTeams", label: "Vaciar equipos" },
    { id: "reset", label: "Resetear sala" },
  ] as const;
  return (
    <DashboardDialog titleId="room-demo-title" onClose={onClose}>
      <div className="dashboard-panel p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="room-demo-title" className="dashboard-section-title">
            Herramientas demo
          </h2>
          <button
            className={button}
            aria-label="Cerrar herramientas demo"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Solo para probar este mock. Rellenar 5v5 conserva al creador y los
          capitanes, y omite el draft.
        </p>
        <label className="mt-5 block text-xs text-zinc-400">
          Demo: usuario conectado
          <DashboardDropdown
            label={"Demo: usuario conectado"}
            options={[
              ...allPlayers(state).map((player) => ({
                value: player.id,
                label: player.name,
              })),
            ]}
            className="dashboard-dropdown-field mt-2 w-full"
            value={actor}
            onChange={(value) => onActor(value)}
          />
        </label>
        {isHost ? (
          <div className="mt-5 grid gap-2">
            {actions.map((action) => (
              <button
                key={action.id}
                disabled={locked && action.id !== "reset"}
                className={`${action.id === "fill5v5" ? "dashboard-primary-button" : button} disabled:opacity-40`}
                onClick={() => {
                  onDemo(action.id);
                  onClose();
                }}
              >
                {action.label}
              </button>
            ))}
            {state.phase === "READY_CHECK" && (
              <ReadyDemoActions onDemo={onDemo} />
            )}
            {onLifecycle && state.phase === "PREPARING" && (
              <button
                className={button}
                onClick={() => {
                  onLifecycle("lobbySent");
                  onClose();
                }}
              >
                Simular lobby enviado
              </button>
            )}
            {onLifecycle && state.phase === "WAITING_FOR_PLAYERS" && (
              <button
                className={button}
                onClick={() => {
                  onLifecycle("gameStarted");
                  onClose();
                }}
              >
                Simular inicio real de partida
              </button>
            )}
            {state.phase === "IN_GAME" &&
              (["radiant", "dire"] as const).map((team) => (
                <button
                  key={team}
                  className={button}
                  onClick={() => {
                    onFinish(team);
                    onClose();
                  }}
                >
                  Terminar demo · victoria de{" "}
                  {team === "radiant" ? "Radiant" : "Dire"}
                </button>
              ))}
          </div>
        ) : (
          <p className="mt-5 text-xs text-zinc-500">
            Con esta cuenta puedes probar las acciones del jugador. Vuelve al
            creador para rellenar o resetear la demo.
          </p>
        )}
      </div>
    </DashboardDialog>
  );
}
