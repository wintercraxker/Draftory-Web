"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import {
  roomFormat,
  roomModeLabel,
  roomServerLabel,
} from "@/lib/rooms/lobby-options.mjs";

import { DashboardDropdown } from "./Dropdown";

import { createPortal } from "react-dom";
import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  Settings,
  Wrench,
  Crown,
  LogOut,
} from "lucide-react";
import {
  allPlayers,
  playerTeam,
  canProposeBalance,
  allowedInvitationTeams,
  currentPickTeam,
  type Action,
  type LobbyState,
  type RoomPlayer,
  type Team,
} from "@/lib/rooms/engine";
import { getRoomStatus } from "@/lib/rooms/presentation";
import { teamMetrics } from "@/lib/rooms/balance";
import { roomConfig, firstPickMethods } from "@/lib/rooms/config";
import type { DemoRoomAction } from "@/lib/rooms/demo";
import { getPlayerRank, type Player } from "@/lib/competitive";
import type { Room } from "@/lib/room-mock-data";
import { CaptainMinigame } from "./CaptainMinigame";
import { DashboardButton, DashboardToast } from "./DashboardUi";
import { DashboardDialog } from "./DashboardDialog";
import { LobbyPlayer } from "./LobbyPlayer";
import { RoleDropdown } from "./DotaRoles";
import { getRoomRole, type DotaRoleId } from "@/lib/dota-roles";
import { RoomChat } from "./RoomChat";
import { RoomBalance } from "./RoomBalance";
import { RoomConfiguration, RoomDemoTools } from "./RoomControls";
import { RoomStatusBanner } from "./RoomPhaseBar";
import { ReadyCheckPanel } from "./ReadyCheckPanel";
import { DotaLobbyPanel } from "./DotaLobbyPanel";
import { CancelMatchPanel } from "./CancelMatchPanel";
import { CommendPanel } from "./CommendPanel";
import { closeCommends } from "@/lib/rooms/recognition";
import { useRoomClock, useLobbyPlayerMotion } from "./useLobbyPresentation";

const button =
  "dashboard-button inline-flex items-center gap-2 px-3 py-2 text-xs";

export function RoomLobby({
  room,
  state,
  onAction,
  onBack,
  onDemo,
  viewerId,
  chatContainer,
  serverNow,
  notice,
  onLifecycle,
  onPrivacy,
  availableActions,
  footer,
  onMinigame,
  startBlocker,
}: {
  room: Room;
  state: LobbyState;
  onAction: (action: Action, actor: string) => void | Promise<void | boolean>;
  onBack: () => void;
  onDemo?: (action: DemoRoomAction, actor: string) => void;
  viewerId: string;
  chatContainer?: HTMLElement | null;
  serverNow?: number;
  notice?: string;
  startBlocker?: string;
  onLifecycle?: (
    event: "lobbySent" | "gameStarted" | "gameFinished",
    winningTeam?: Team,
  ) => void;
  onPrivacy?: (privateRoom: boolean, password?: string) => Promise<void>;
  availableActions?: readonly Action["type"][];
  onMinigame?: (
    move?: import("@/lib/rooms/minigame").RpsMove,
  ) => Promise<boolean>;
  footer?: import("react").ReactNode;
}) {
  const supports = (type: Action["type"]) =>
    availableActions === undefined || availableActions.includes(type);
  const [roleFilter, setRoleFilter] = useState<DotaRoleId | null>(null);
  const [actingCaptain, setActingCaptain] = useState(viewerId);
  const [panel, setPanel] = useState<"configuration" | "demo" | null>(null);

  const [captainSelection, setCaptainSelection] = useState(false);
  const [choice, setChoice] = useState<{
    playerId: string;
    kind: "captain" | "pick";
    actor: string;
    pick: number;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirming = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">(
    "success",
  );
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutation = useRef(false);
  const [changingCaptain, setChangingCaptain] = useState<Team | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );
  const [attempt, setAttempt] = useState<{
    text: string;
    pick: number;
    actor: string;
    key: string;
  } | null>(null);
  const now = useRoomClock(state, serverNow);
  const rosterRef = useLobbyPlayerMotion(state);
  const demoHost = !!onDemo && viewerId === state.hostId;
  const players = allPlayers(state);
  const actor =
    demoHost && players.some((player) => player.id === actingCaptain)
      ? actingCaptain
      : viewerId;
  const isHost = actor === state.hostId;
  const member = players.some((player) => player.id === actor);
  const allowedTeams = allowedInvitationTeams(state, actor);
  const team = currentPickTeam(state);
  const status = getRoomStatus(state, actor, now);
  const activeCaptain = team
    ? players.find((player) => player.id === state.captains?.[team])
    : undefined;
  const metrics = teamMetrics(state.radiant, state.dire);
  const full =
    state.radiant.length === roomFormat(state.mode).teamSize &&
    state.dire.length === roomFormat(state.mode).teamSize;
  const balance = roomConfig.balanceThresholds.find(
    (item) => metrics.averageDifference <= item.max,
  )!;
  const send = async (action: Action) => {
    if (!supports(action.type)) return false;
    const guarded = [
      "pick",
      "captain",
      "move",
      "kick",
      "replaceCaptain",
      "applyBalance",
      "proposeBalance",
      "roomRole",
    ].includes(action.type);
    if (guarded && mutation.current) return false;
    if (guarded) {
      mutation.current = true;
      setMutationBusy(true);
    }
    if (action.type === "start" || action.type === "prepare") setPanel(null);
    if (action.type === "prepare") setCaptainSelection(true);
    try {
      const result = await onAction(
        action,
        action.type === "roomRole" ? viewerId : actor,
      );
      if (result !== false && guarded) {
        const name =
          "playerId" in action
            ? (players.find((player) => player.id === action.playerId)?.name ??
              "Jugador")
            : "";
        setFeedbackTone("success");
        setFeedback(
          action.type === "pick"
            ? `${name} seleccionado.`
            : action.type === "captain" || action.type === "replaceCaptain"
              ? `${name} designado capitán.`
              : action.type === "move"
                ? action.destination === "bench"
                  ? `${name} volvió al banco.`
                  : `${name} subió a ${action.destination === "radiant" ? "Radiant" : "Dire"}.`
                : action.type === "kick"
                  ? `${name} expulsado de la sala.`
                  : action.type === "applyBalance"
                    ? "Equipos balanceados."
                    : action.type === "roomRole"
                      ? "Rol de sala actualizado."
                      : "Propuesta de balance lista.",
        );
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(""), 2500);
      }
      return result;
    } catch (error) {
      setFeedbackTone("error");
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo completar la acción.",
      );
      return false;
    } finally {
      if (guarded) {
        mutation.current = false;
        setMutationBusy(false);
      }
    }
  };
  const showMinigame =
    (availableActions === undefined || !!onMinigame) &&
    !!state.captains &&
    (state.phase === "DECIDING_FIRST_PICK" ||
      (state.phase === "DRAFTING" &&
        state.highlight?.kind === "first_pick" &&
        now < state.highlight.expiresAt));
  const showDotaExperience = [
    "PREPARING",
    "WAITING_FOR_PLAYERS",
    "IN_GAME",
    "FINISHED",
  ].includes(state.phase);
  const selectionNotice =
    attempt?.pick === state.pick && attempt.actor === actor
      ? attempt.text
      : undefined;
  function selectPlayer(player: Player) {
    if (!status.ownTurn || !team) {
      setAttempt({
        actor,
        pick: state.pick,
        key: status.key,
        text: `${activeCaptain?.name ?? "El capitán"} está eligiendo actualmente.`,
      });
      return;
    }
    setAttempt(null);
    setChoice({ playerId: player.id, kind: "pick", actor, pick: state.pick });
  }
  const validChoice =
    choice &&
    choice.actor === actor &&
    (choice.kind === "captain"
      ? captainSelection && isHost && state.phase === "CHOOSING_CAPTAINS"
      : status.ownTurn && choice.pick === state.pick)
      ? state.bench.find((player) => player.id === choice.playerId)
      : undefined;
  const rival: Team =
    playerTeam(state, state.hostId) === "dire" ? "radiant" : "dire";
  async function confirmChoice() {
    if (!validChoice || !choice || confirming.current) return;
    confirming.current = true;
    setConfirmBusy(true);
    try {
      const result = await send({
        type: choice.kind === "captain" ? "captain" : "pick",
        playerId: validChoice.id,
      });
      if (result !== false) {
        setChoice(null);
        if (choice.kind === "captain") setCaptainSelection(false);
      }
    } finally {
      confirming.current = false;
      setConfirmBusy(false);
    }
  }
  const playerCard = (player: RoomPlayer, zone: Team | "bench") => {
    const captain =
      player.id === state.captains?.radiant ||
      player.id === state.captains?.dire ||
      (availableActions === undefined &&
        player.id === state.hostId &&
        state.formation === "captains" &&
        !!playerTeam(state, state.hostId));
    const choosingCaptain =
      supports("captain") &&
      zone === "bench" &&
      captainSelection &&
      isHost &&
      state.phase === "CHOOSING_CAPTAINS";
    const pickable = supports("pick") && zone === "bench" && status.ownTurn;
    const demoMoves =
      (isHost || (state.captains && zone === "bench")) &&
      (!captain || (player.id === state.hostId && !state.captains)) &&
      ["WAITING", "READY", "DRAFTING"].includes(state.phase)
        ? (["radiant", "dire", "bench"] as const).filter(
            (destination) =>
              destination !== zone &&
              (state.phase !== "DRAFTING" || destination === "bench") &&
              (destination === "bench"
                ? isHost
                : (player.id === actor && isHost) ||
                  allowedTeams.includes(destination)) &&
              (state.phase !== "DRAFTING" || destination === "bench") &&
              (destination === "bench" ||
                state[destination].length < roomConfig.teamSize),
          )
        : undefined;
    const editable = [
      "WAITING",
      "CHOOSING_CAPTAINS",
      "DECIDING_FIRST_PICK",
      "DRAFTING",
      "READY",
    ].includes(state.phase);
    const moves =
      availableActions === undefined
        ? demoMoves
        : supports("move") &&
            ["WAITING", "READY", "DRAFTING"].includes(state.phase) &&
            !captain &&
            (isHost ||
              state.captains?.radiant === actor ||
              state.captains?.dire === actor)
          ? (["radiant", "dire", "bench"] as const).filter(
              (destination) =>
                destination !== zone &&
                (isHost ||
                  ((zone === "bench" || zone === playerTeam(state, actor)) &&
                    (destination === "bench" ||
                      destination === playerTeam(state, actor)))) &&
                (destination === "bench" ||
                  state[destination].length < roomConfig.teamSize),
            )
          : undefined;
    return (
      <LobbyPlayer
        pendingActions={
          availableActions !== undefined && isHost && player.id !== state.hostId
            ? [
                ...(!supports("kick") ? ["Expulsar"] : []),
                ...(!supports("captain") ? ["Designar capitán"] : []),
              ]
            : undefined
        }
        busy={mutationBusy}
        onReplaceCaptain={
          supports("replaceCaptain") &&
          isHost &&
          captain &&
          player.id !== state.hostId &&
          [
            "WAITING",
            "CHOOSING_CAPTAINS",
            "DECIDING_FIRST_PICK",
            "DRAFTING",
            "READY",
          ].includes(state.phase) &&
          zone !== "bench"
            ? () => {
                setChangingCaptain(zone);
                setReplacementId("");
              }
            : undefined
        }
        key={player.id}
        player={player}
        onRoleChange={
          supports("roomRole") &&
          player.id === viewerId &&
          (availableActions === undefined || editable) &&
          state.matchStartedAt === undefined &&
          !["IN_GAME", "FINISHED"].includes(state.phase)
            ? (role) => send({ type: "roomRole", playerId: viewerId, role })
            : undefined
        }
        zone={zone}
        captain={captain}
        pickable={pickable || choosingCaptain}
        selected={validChoice?.id === player.id}
        selectionKind={choosingCaptain ? "captain" : "pick"}
        onSelectAttempt={
          choosingCaptain
            ? () =>
                setChoice({
                  playerId: player.id,
                  kind: "captain",
                  actor,
                  pick: state.pick,
                })
            : pickable
              ? () => selectPlayer(player)
              : undefined
        }
        ready={state.readyCheck?.readyPlayerIds.includes(player.id)}
        moves={moves}
        onMove={(destination) =>
          send({ type: "move", playerId: player.id, destination })
        }
        selfJoin={player.id === actor}
        onKick={
          supports("kick") &&
          isHost &&
          player.id !== state.hostId &&
          !["IN_GAME", "FINISHED"].includes(state.phase)
            ? () => send({ type: "kick", playerId: player.id })
            : undefined
        }
      />
    );
  };
  const chat = (
    <RoomChat
      messages={state.messages}
      participants={players.length}
      real={availableActions !== undefined}
      pending={!supports("chat")}
      canSend={member && supports("chat")}
      onSend={(text) => send({ type: "chat", text })}
    />
  );
  return (
    <section className="lobby-shell">
      {mutationBusy ? (
        <DashboardToast tone="info" text="Aplicando cambio…" />
      ) : (
        feedback && <DashboardToast tone={feedbackTone} text={feedback} />
      )}
      <div className="lobby-main" ref={rosterRef}>
        <header className="lobby-header">
          <div className="min-w-0">
            <button
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-white"
            >
              <ArrowLeft size={12} />
              Volver a salas
            </button>
            <h1 className="break-words text-xl font-semibold">{room.title}</h1>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              {roomModeLabel(room.mode)} · {roomServerLabel(room.region)} ·{" "}
              {state.radiant.length + state.dire.length}/
              {roomFormat(state.mode).players} activos
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isHost && state.phase !== "FINISHED" && (
              <button
                onClick={() => setPanel("configuration")}
                className={button}
              >
                <Settings size={13} />
                Configuración
              </button>
            )}
            {demoHost && (
              <button
                className={button}
                onClick={() => setPanel("demo")}
                aria-label="Abrir herramientas demo"
              >
                <Wrench size={13} />
                <span className="sr-only sm:not-sr-only">Demo</span>
              </button>
            )}
          </div>
        </header>
        {state.continuation && state.phase === "READY" && (
          <div
            className="dashboard-panel p-4 text-xs text-zinc-400"
            role="status"
          >
            <p>
              {state.continuation.state === "WAITING_CLEANUP"
                ? "Esperando confirmación de cierre. Todavía no puedes reiniciar."
                : state.continuation.state === "EXPIRED"
                  ? "La reserva de continuación venció. No se elegirá otro bot sin tu confirmación."
                  : state.continuation.connected === false
                    ? `Esperando la conexión de ${state.continuation.reference}. La continuación conserva ese bot hasta que venza la reserva.`
                    : `Partida cancelada. Puedes volver a iniciar con los mismos jugadores y ${state.continuation.reference}.`}
            </p>
            {isHost &&
              ["RESERVED", "EXPIRED"].includes(state.continuation.state) && (
                <button
                  className="dashboard-button mt-3 px-3 py-2"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Cancelar la continuación? El próximo intento podrá utilizar otro bot disponible.",
                      )
                    )
                      void send({ type: "releaseContinuation" });
                  }}
                >
                  Cancelar continuación
                </button>
              )}
          </div>
        )}
        {!showDotaExperience && (
          <RoomStatusBanner
            competitivePending={!supports("prepare")}
            startBlocker={
              state.continuation && state.continuation.state !== "RESERVED"
                ? "Espera el cierre seguro o cancela la continuación vencida."
                : startBlocker
            }
            state={state}
            actor={actor}
            now={now}
            onAction={send}
            onConfigure={() => {
              setCaptainSelection(true);
              setPanel(null);
            }}
            onCaptainSelection={captainSelection}
            onCancelCaptainSelection={() => {
              setCaptainSelection(false);
              setChoice(null);
            }}
            notice={selectionNotice ?? notice}
            tools={
              <CancelMatchPanel
                state={state}
                actor={actor}
                now={now}
                onAction={async (action) => {
                  await send(action);
                }}
              />
            }
          >
            {showMinigame && (
              <>
                {state.phase === "DECIDING_FIRST_PICK" &&
                  !state.firstPickStarted &&
                  isHost && (
                    <div className="room-minigame-methods">
                      {firstPickMethods.map((method) => (
                        <button
                          key={method.id}
                          aria-pressed={state.game === method.id}
                          className="room-minigame-method"
                          onClick={() =>
                            send({ type: "setFirstPickGame", game: method.id })
                          }
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  )}
                <CaptainMinigame
                  key={
                    state.game + state.captains?.radiant + state.captains?.dire
                  }
                  state={state}
                  actor={actor}
                  clockNow={now}
                  onAction={onAction}
                  realPlay={onMinigame}
                />
              </>
            )}
          </RoomStatusBanner>
        )}

        {showDotaExperience ? (
          <DotaLobbyPanel
            key={`${state.roomId}:${state.attempt?.id}`}
            state={state}
            viewerId={viewerId}
            region={room.region}
            real={availableActions !== undefined}
            cancelControl={
              <CancelMatchPanel
                state={state}
                actor={actor}
                now={now}
                onAction={async (action) => {
                  await send(action);
                }}
              />
            }
          />
        ) : (
          <>
            <div className="lobby-team-columns">
              {(["radiant", "dire"] as const).map((side) => (
                <section
                  key={side}
                  className={`lobby-zone lobby-${side} dashboard-panel`}
                >
                  <div className="lobby-team-heading">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-xs font-semibold uppercase tracking-wider">
                        {side}
                      </h2>
                      <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-zinc-400">
                        {state[side].length ===
                          roomFormat(state.mode).teamSize && (
                          <Check size={12} className="text-emerald-300/70" />
                        )}
                        {state[side].length} / {roomFormat(state.mode).teamSize}
                      </span>
                    </div>
                    <p className="lobby-team-status">
                      {team === side &&
                      !["first_pick", "pick_confirmed"].includes(
                        status.kind,
                      ) ? (
                        <>
                          <span className="room-status-dot room-status-dot-active" />
                          Eligiendo ·{" "}
                          <PlayerDisplayName
                            id={activeCaptain?.id}
                            name={activeCaptain?.name ?? "Capitán"}
                          />
                        </>
                      ) : state.captains?.[side] ? (
                        <>
                          Capitán ·{" "}
                          <PlayerDisplayName
                            id={state.captains?.[side] ?? undefined}
                            name={
                              players.find(
                                (player) =>
                                  player.id === state.captains?.[side],
                              )?.name ?? "Jugador"
                            }
                          />
                        </>
                      ) : availableActions === undefined &&
                        state.formation === "captains" &&
                        state[side].some(
                          (player) => player.id === state.hostId,
                        ) ? (
                        <>
                          Capitán ·{" "}
                          <PlayerDisplayName
                            id={state.hostId}
                            name={
                              players.find(
                                (player) => player.id === state.hostId,
                              )?.name ?? "Jugador"
                            }
                          />
                        </>
                      ) : (
                        "Esperando jugadores"
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {state[side].map((player) => playerCard(player, side))}
                    {Array.from(
                      {
                        length: Math.max(
                          0,
                          roomFormat(state.mode).teamSize - state[side].length,
                        ),
                      },
                      (_, index) => (
                        <div key={index} className="lobby-empty-slot">
                          <span className="lobby-slot-number">
                            {state[side].length + index + 1}
                          </span>
                          <span>Slot disponible</span>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
            {full &&
              roomFormat(state.mode).playerDraft &&
              !metrics.complete && (
                <p className="rounded-xl border border-zinc-800 p-4 text-xs text-zinc-500">
                  Equilibrio no disponible: faltan datos de MMR. Completa la
                  información competitiva de los jugadores para preparar el
                  balance.
                </p>
              )}
            {full && roomFormat(state.mode).playerDraft && metrics.complete && (
              <section
                className="room-equilibrium"
                aria-label="Equilibrio de equipos"
              >
                <div className="room-equilibrium-overview">
                  <div>
                    <h2 className="dashboard-label">Equilibrio de equipos</h2>
                    <p className="text-xs text-zinc-500">
                      MMR total · Radiant{" "}
                      {metrics.radiant.total.toLocaleString("es-ES")} · Dire{" "}
                      {metrics.dire.total.toLocaleString("es-ES")}
                    </p>
                    <p>
                      <span>
                        Radiant promedio{" "}
                        <strong>
                          {metrics.radiant.average.toLocaleString("en-US", {
                            maximumFractionDigits: 1,
                          })}{" "}
                          MMR
                        </strong>
                      </span>
                      <span>
                        Dire promedio{" "}
                        <strong>
                          {metrics.dire.average.toLocaleString("en-US", {
                            maximumFractionDigits: 1,
                          })}{" "}
                          MMR
                        </strong>
                      </span>
                    </p>
                  </div>
                  <div className="room-equilibrium-delta">
                    <span>Diferencia de promedios</span>
                    <strong>
                      {metrics.averageDifference.toLocaleString("en-US", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      MMR
                    </strong>
                    <small>{balance.label}</small>
                  </div>
                  {(actor === state.hostId ||
                    actor === state.captains?.radiant ||
                    actor === state.captains?.dire) && (
                    <div>
                      <button
                        disabled={
                          !canProposeBalance(state, actor) ||
                          !supports("proposeBalance") ||
                          !!state.balanceProposal
                        }
                        className={button}
                        onClick={() => send({ type: "proposeBalance" })}
                      >
                        Equilibrar por MMR
                      </button>
                      {!canProposeBalance(state, actor) && (
                        <p className="mt-2 text-xs text-zinc-500">
                          El equilibrio está bloqueado durante Ready Check,
                          preparación o partida activa.
                        </p>
                      )}
                      {state.balanceProposal && (
                        <p className="mt-2 text-xs text-zinc-500">
                          Revisa o descarta la propuesta actual antes de
                          calcular otra.
                        </p>
                      )}
                      {canProposeBalance(state, actor) &&
                        !supports("proposeBalance") &&
                        !state.balanceProposal && (
                          <p className="mt-2 text-xs text-zinc-500">
                            Esta acción no está disponible en el estado actual.
                            Actualiza la sala.
                          </p>
                        )}
                    </div>
                  )}
                </div>
                <div className="room-equilibrium-meter" aria-hidden="true">
                  <span
                    style={{
                      width: `${100 / (1 + metrics.averageDifference / roomConfig.balanceThresholds[2].max)}%`,
                    }}
                  />
                </div>
                {state.balanceProposal && (
                  <RoomBalance
                    proposal={state.balanceProposal}
                    players={[...state.radiant, ...state.dire]}
                    canApply={isHost}
                    canCancel={
                      isHost || state.balanceProposal.proposedBy === actor
                    }
                    onApply={() => send({ type: "applyBalance" })}
                    onCancel={() => send({ type: "cancelBalance" })}
                  />
                )}
              </section>
            )}
            {state.first && (
              <p className="lobby-first-pick">
                <Check size={11} />
                Primer pick · {state.first === "radiant" ? "Radiant" : "Dire"}
                <span>
                  {state.firstPickSource === "demo"
                    ? "Asignado en demo, sin minijuego"
                    : firstPickMethods.find(
                        (method) => method.id === state.game,
                      )?.label}
                </span>
              </p>
            )}
            <section className="lobby-bench dashboard-panel p-3">
              <h2 className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-1 pb-3 text-xs font-semibold">
                Banco de jugadores
                <span className="font-normal tabular-nums text-zinc-500">
                  {state.bench.length} disponibles
                </span>
              </h2>
              {state.phase === "DRAFTING" && (
                <p className="mb-3 px-1 text-[10px] text-zinc-500">
                  {status.ownTurn
                    ? "Haz clic en una tarjeta del banco para elegir a tu jugador."
                    : status.kind === "first_pick"
                      ? "Primer pick decidido. El draft comienza en unos segundos."
                      : status.kind === "pick_confirmed"
                        ? "Pick confirmado. Preparando el siguiente turno."
                        : `${activeCaptain?.name ?? "El capitán"} está eligiendo actualmente.`}
                </p>
              )}
              <div className="bank-role-filter">
                <span>Filtrar por rol</span>
                <RoleDropdown
                  label="Filtrar banco por rol"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  allowNone
                  noneLabel="Todos"
                />
              </div>
              <div className="lobby-bench-grid scrollbar-hide">
                {state.bench
                  .filter(
                    (player) =>
                      roleFilter === null || getRoomRole(player) === roleFilter,
                  )
                  .map((player) => playerCard(player, "bench"))}
                {!state.bench.some(
                  (player) =>
                    roleFilter === null || getRoomRole(player) === roleFilter,
                ) && (
                  <p className="p-4 text-xs text-zinc-600">
                    No hay jugadores disponibles con este filtro.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
        {(footer ||
          (!footer &&
            member &&
            actor !== state.hostId &&
            [
              "WAITING",
              "CHOOSING_CAPTAINS",
              "DECIDING_FIRST_PICK",
              "DRAFTING",
              "READY",
            ].includes(state.phase))) && (
          <footer className="room-lower-controls">
            {footer}
            {!footer &&
              member &&
              actor !== state.hostId &&
              [
                "WAITING",
                "CHOOSING_CAPTAINS",
                "DECIDING_FIRST_PICK",
                "DRAFTING",
                "READY",
              ].includes(state.phase) && (
                <DashboardButton
                  variant="ghost"
                  onClick={() => send({ type: "leave" })}
                >
                  <LogOut size={13} />
                  Salir de la sala
                </DashboardButton>
              )}
          </footer>
        )}
        {panel === "configuration" && isHost && (
          <RoomConfiguration
            pending={!supports("configure")}
            isPrivate={room.isPrivate}
            onPrivacy={onPrivacy}
            state={state}
            actor={actor}
            onAction={send}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "demo" && demoHost && (
          <RoomDemoTools
            state={state}
            actor={actor}
            onActor={(id) => {
              setActingCaptain(id);
              setAttempt(null);
              setPanel(null);
            }}
            onDemo={(action) => onDemo?.(action, actor)}
            onLifecycle={onLifecycle}
            onFinish={(winningTeam) => {
              if (onLifecycle && state.attempt)
                onLifecycle("gameFinished", winningTeam);
              else send({ type: "finish", winningTeam });
            }}
            onClose={() => setPanel(null)}
          />
        )}

        {validChoice && choice && (
          <DashboardDialog
            titleId="lobby-choice-title"
            dismissible={!confirmBusy}
            onClose={() => {
              if (!confirmBusy) setChoice(null);
            }}
          >
            <div className="dashboard-panel p-5">
              <p className="dashboard-eyebrow">
                {choice.kind === "captain"
                  ? "Designar capitán"
                  : "Elegir jugador"}
              </p>
              <h2
                id="lobby-choice-title"
                className="dashboard-section-title mt-3"
              >
                {choice.kind === "captain" && (
                  <Crown className="inline mr-2 text-amber-200" size={17} />
                )}
                <PlayerDisplayName
                  id={validChoice.id}
                  name={validChoice.name}
                />
              </h2>
              <p className="mt-2 text-xs text-zinc-400">
                {getPlayerRank(validChoice).name} ·{" "}
                {getPlayerRank(validChoice).label}
              </p>
              <p className="mt-4 text-sm text-zinc-300">
                {choice.kind === "captain"
                  ? `Será el capitán de ${rival === "radiant" ? "Radiant" : "Dire"}.`
                  : `Se unirá a ${team === "radiant" ? "Radiant" : "Dire"}.`}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <DashboardButton
                  variant="ghost"
                  disabled={confirmBusy}
                  onClick={() => setChoice(null)}
                >
                  Cancelar
                </DashboardButton>
                <DashboardButton
                  variant="primary"
                  busy={confirmBusy}
                  onClick={() => void confirmChoice()}
                >
                  {choice.kind === "captain"
                    ? "Confirmar capitán"
                    : "Confirmar pick"}
                </DashboardButton>
              </div>
              {notice && (
                <p role="status" className="mt-3 text-xs text-amber-200">
                  {notice}
                </p>
              )}
            </div>
          </DashboardDialog>
        )}
        {changingCaptain && isHost && state.captains && (
          <DashboardDialog
            titleId="replace-captain-title"
            dismissible={!mutationBusy}
            onClose={() => setChangingCaptain(null)}
          >
            <div className="dashboard-panel p-5">
              <h2
                id="replace-captain-title"
                className="dashboard-section-title"
              >
                Cambiar capitán
              </h2>
              <p className="mt-3 text-sm text-zinc-300">
                {
                  players.find(
                    (player) => player.id === state.captains?.[changingCaptain],
                  )?.name
                }{" "}
                actualmente es capitán de{" "}
                {changingCaptain === "radiant" ? "Radiant" : "Dire"}.
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Para devolverlo al banco primero debes designar otro capitán.
                Los demás jugadores conservan sus plazas.
              </p>
              <label className="block mt-4 text-xs text-zinc-400">
                Nuevo capitán
                <DashboardDropdown
                  label={"Nuevo capitán"}
                  options={[
                    { value: "", label: "Selecciona un jugador del banco" },
                    ...state.bench.map((player) => ({
                      value: player.id,
                      label: player.name,
                    })),
                  ]}
                  className="dashboard-dropdown-field mt-2 w-full"
                  disabled={mutationBusy}
                  value={replacementId}
                  onChange={(value) => setReplacementId(value)}
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <DashboardButton
                  variant="ghost"
                  disabled={mutationBusy}
                  onClick={() => setChangingCaptain(null)}
                >
                  Cancelar
                </DashboardButton>
                <DashboardButton
                  variant="primary"
                  busy={mutationBusy}
                  disabled={
                    !state.bench.some((player) => player.id === replacementId)
                  }
                  onClick={async () => {
                    const result = await send({
                      type: "replaceCaptain",
                      playerId: replacementId,
                      team: changingCaptain,
                    });
                    if (result !== false) setChangingCaptain(null);
                  }}
                >
                  Cambiar capitán
                </DashboardButton>
              </div>
              {notice && (
                <p role="alert" className="mt-3 text-xs text-rose-200">
                  {notice}
                </p>
              )}
            </div>
          </DashboardDialog>
        )}
        <CommendPanel
          state={
            state.completion
              ? { ...state, completion: closeCommends(state.completion, now) }
              : state
          }
          actor={actor}
          now={now}
          onAction={async (action) => {
            await send(action);
          }}
        />
        <ReadyCheckPanel
          notice={notice}
          state={state}
          actor={actor}
          serverNow={serverNow !== undefined ? now : serverNow}
          onAction={send}
          demo={
            demoHost
              ? {
                  onActor: setActingCaptain,
                  onDemo: (action) => onDemo?.(action, actor),
                }
              : undefined
          }
        />
      </div>
      {chatContainer ? (
        createPortal(chat, chatContainer)
      ) : (
        <div className="lobby-chat-mobile">{chat}</div>
      )}
    </section>
  );
}
