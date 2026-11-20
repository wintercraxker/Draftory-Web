"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { PlayerDotaMedal } from "./PlayerDotaMedal";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  Users,
  Gamepad2,
  MapPin,
  TriangleAlert,
} from "lucide-react";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";

import { roomModeLabel, roomServerLabel } from "@/lib/rooms/lobby-options.mjs";
import {
  dotaParticipantState,
  dotaPreparationView,
  dotaPreparationMilestones,
} from "@/lib/rooms/dota-presentation";
import type { LobbyState } from "@/lib/rooms/engine";

type Access = {
  key: string;
  lobbyId: string;
  name: string;
  password: string;
  team: string;
  slot: number;
  mode: string;
  region: string;
  availability: string;
};
async function requestLobbyAccess(roomId: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/rooms/${encodeURIComponent(roomId)}/lobby-access`,
    { method: "POST", cache: "no-store", signal },
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}
export function DotaLobbyPanel({
  state,
  viewerId,
  region,
  cancelControl,
  real = true,
}: {
  state: LobbyState;
  viewerId?: string;
  region?: string;
  cancelControl?: ReactNode;
  real?: boolean;
}) {
  const [visibleKey, setVisibleKey] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [access, setAccess] = useState<Access | null>(null),
    [accessBusy, setAccessBusy] = useState(false);
  const roomId = state.roomId,
    lobbyId = state.dotaLobby?.lobbyId;
  const cancelling =
    !!state.dotaLobby?.cancellationDiagnostic ||
    (state.cancelVote?.status === "PASSED" &&
      state.externalCancellationPending === true) ||
    state.dotaLobby?.automationPhase === "CANCELLING";
  const accessKey = `${roomId}:${state.attempt?.id}:${lobbyId}:${viewerId}`;
  const visible = visibleKey === accessKey;
  const canAccess =
    real &&
    !cancelling &&
    !!viewerId &&
    !!lobbyId &&
    ["WAITING_FOR_PLAYERS", "IN_GAME"].includes(state.phase) &&
    ["INVITING", "WAITING", "RECONNECTING", "STARTING", "STARTED"].includes(
      state.dotaLobby?.productStatus ?? "",
    ) &&
    [...state.radiant, ...state.dire].some((p) => p.id === viewerId);
  const readAccess = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const v = await requestLobbyAccess(roomId, signal);
        if (!signal?.aborted && v.lobbyId === lobbyId) {
          setAccess({ ...v, key: accessKey });
          setNotice("");
        }
      } catch (e) {
        if (!signal?.aborted) {
          setAccess(null);
          setNotice(e instanceof Error ? e.message : "Acceso no disponible.");
        }
      } finally {
        if (!signal?.aborted) setAccessBusy(false);
      }
    },
    [roomId, lobbyId, accessKey],
  );
  useEffect(() => {
    if (!canAccess) return;
    const controller = new AbortController();
    void requestLobbyAccess(roomId, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted && v.lobbyId === lobbyId) {
          setAccess({ ...v, key: accessKey });
          setNotice("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setAccess(null);
          setNotice(e instanceof Error ? e.message : "Acceso no disponible.");
        }
      });
    const timer = setInterval(() => {
      void (async () => {
        try {
          const r = await fetch(
            `/api/rooms/${encodeURIComponent(roomId)}/lobby-access`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ checkOnly: true }),
              cache: "no-store",
              signal: controller.signal,
            },
          );
          const v = await r.json();
          if (!controller.signal.aborted) {
            if (!r.ok || v.lobbyId !== lobbyId) {
              setAccess(null);
              setVisibleKey(null);
            } else
              setAccess((a) =>
                a?.key === accessKey
                  ? { ...a, availability: v.availability }
                  : a,
              );
          }
        } catch {
          if (!controller.signal.aborted) {
            setAccess(null);
            setVisibleKey(null);
          }
        }
      })();
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [canAccess, roomId, lobbyId, accessKey]);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiado.`);
    } catch {
      setNotice(
        "No se pudo copiar. Puedes mostrar el dato y copiarlo manualmente.",
      );
    }
  }
  const view = dotaPreparationView(state),
    lobby = state.dotaLobby;
  const currentAccess =
    canAccess && access?.key === accessKey && access.lobbyId === lobbyId
      ? access
      : null;
  const regionLabel = roomServerLabel(region ?? lobby?.region ?? "");
  return (
    <section
      className={`dota-stage dota-stage-${view.stage} ${view.teamSize === 1 ? "dota-stage-duel" : ""}`}
      aria-labelledby="dota-stage-title"
    >
      <header className="dota-stage-heading">
        <div className="dota-stage-icon" aria-hidden="true">
          {view.stage === "preparing" ? (
            <LoaderCircle className="dota-activity" size={24} />
          ) : view.stage === "complete" ? (
            <ShieldCheck size={26} />
          ) : (
            <Gamepad2 size={26} />
          )}
        </div>
        <div className="dota-stage-heading-copy">
          <p className="dashboard-eyebrow">
            Dota 2 · {roomModeLabel(state.mode ?? lobby?.mode ?? "")}
          </p>
          <h2 id="dota-stage-title">{view.title}</h2>
          <p>{view.subtitle}</p>
        </div>
        <div className="dota-stage-actions">{cancelControl}</div>
      </header>
      <div className="dota-stage-meta">
        {!cancelling && lobby?.progress && (
          <span>
            Invitaciones enviadas: {lobby.progress.invitationsSent}/
            {lobby.progress.expected}
          </span>
        )}
        <span>
          <Gamepad2 size={14} />
          {roomModeLabel(state.mode ?? "")}
        </span>
        {regionLabel && (
          <span>
            <MapPin size={14} />
            {regionLabel}
          </span>
        )}
        <span>
          <Users size={14} />
          {view.expected} participantes
        </span>
      </div>
      {!cancelling && (
        <ol className="dota-milestones" aria-label="Progreso de preparación">
          {dotaPreparationMilestones(state).map((step, index) => (
            <li
              key={step.label}
              className={`dota-milestone-${step.status}`}
              aria-current={step.status === "current" ? "step" : undefined}
            >
              <span aria-hidden="true">
                {step.status === "done" ? <Check size={12} /> : index + 1}
              </span>
              <div>
                {step.label}
                <small>
                  {step.status === "done"
                    ? "Confirmado"
                    : step.status === "current"
                      ? "En curso"
                      : "Pendiente"}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      {cancelling && (
        <section
          className="dashboard-panel p-4 text-sm leading-6 text-zinc-300"
          aria-label="Estado de cancelación"
        >
          <p>
            {lobby?.cancellationDiagnostic?.reason ??
              "La votación fue aprobada. La salida solo se ejecutará cuando Dota confirme que es segura; conservamos la sala y los equipos."}
          </p>
          {lobby?.cancellationDiagnostic && (
            <p className="mt-2 text-xs text-zinc-500">
              Comprobaciones: {lobby.cancellationDiagnostic.attempts}
              {lobby.cancellationDiagnostic.requiresIntervention
                ? " · Requiere intervención administrativa"
                : ""}
              {lobby.cancellationDiagnostic.lastCheckedAt
                ? ` · Última: ${new Date(lobby.cancellationDiagnostic.lastCheckedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`
                : lobby.cancellationDiagnostic.attempts > 0
                  ? " · Sin fecha confirmada"
                  : " · Esperando la primera comprobación del worker"}
              {lobby.cancellationDiagnostic.nextCheckAt
                ? ` · Próxima: ${new Date(lobby.cancellationDiagnostic.nextCheckAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`
                : ""}
            </p>
          )}
        </section>
      )}
      {!cancelling && lobby?.productStatus === "STARTING" && (
        <p role="status" className="dota-stage-notice">
          Launch enviado; estamos verificando el inicio en Dota 2. Si regresaste
          al lobby, conserva esta sala y solicita cancelación. No se abrirá otro
          intento mientras la reserva siga protegida.
        </p>
      )}
      {!cancelling && lobby?.productStatus === "PROBLEM" && (
        <p role="status" className="dota-stage-notice">
          La preparación necesita una comprobación. Conservamos este intento
          para evitar crear otro lobby por error.
        </p>
      )}
      {!cancelling && lobby?.automationPhase && (
        <p role="status" className="dota-stage-notice">
          {
            {
              CANCELLING:
                "Cancelando el intento y comprobando la salida del bot.",
              SEARCHING_BOT:
                "Buscando bot disponible. Todos confirmaron; tu partida permanece en la cola sin repetir la confirmación.",
              FINALIZING:
                "Resultado verificado. Liberando el bot cuando Dota confirme su salida.",
              INTERVENTION:
                "La recuperación necesita intervención administrativa. Este intento se conserva.",
              VERIFYING_ACCESS:
                "Comprobando el acceso al lobby. El inicio permanece bloqueado mientras exista un participante no autorizado.",
              VERIFYING_TEAMS: "Verificando equipos y posiciones en Dota 2.",
            }[lobby.automationPhase]
          }
        </p>
      )}
      {!cancelling &&
        lobbyId &&
        lobby?.presenceFresh !== true &&
        view.stage !== "playing" && (
          <p role="status" className="dota-stage-notice">
            Revalidando la conexión con Dota 2. La última observación no
            confirma la presencia actual.
          </p>
        )}
      {view.stage === "preparing" ? (
        <div className="dota-creation-status" role="status">
          <LoaderCircle size={16} className="dota-activity" />
          <span>Esperando la confirmación del lobby</span>
          <span>Los equipos ya están definidos</span>
        </div>
      ) : (
        !["playing", "result", "cancelling"].includes(view.stage) && (
          <div className="dota-connection-progress">
            <div>
              <strong>
                {view.connected} de {view.expected} jugadores en el lobby
              </strong>
              <span>{view.verified} con equipo verificado</span>
            </div>
            <div
              className="dota-progress-track"
              role="progressbar"
              aria-label="Jugadores en el lobby"
              aria-valuemin={0}
              aria-valuemax={view.expected}
              aria-valuenow={view.connected}
            >
              <span
                style={{
                  width: `${Math.min(100, (view.connected / view.expected) * 100)}%`,
                }}
              />
            </div>
          </div>
        )
      )}
      <div className="dota-versus-teams">
        {(["radiant", "dire"] as const).map((team, index) => (
          <div className="dota-team-group" key={team}>
            <header>
              <span className={`dota-team-mark dota-team-${team}`} />
              <h3>{team === "radiant" ? "Radiant" : "Dire"}</h3>
              <span>
                {state[team].length}/{view.teamSize}
              </span>
            </header>
            <div className="dota-team-players">
              {state[team].map((player) => {
                const status = dotaParticipantState(state, player.id, team),
                  self = player.id === viewerId;
                const late = ["playing", "result", "cancelling"].includes(
                  view.stage,
                );
                return (
                  <article
                    className={`dota-participant dota-participant-${late ? "playing" : status.kind}`}
                    key={player.id}
                  >
                    <div className="dota-participant-portrait">
                      <PlayerAvatar
                        player={player}
                        size={view.teamSize === 1 ? 88 : 48}
                        className="dota-participant-avatar"
                      />
                      {!late && status.verified && (
                        <span className="dota-participant-check">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div className="dota-participant-identity">
                      <h4>
                        <PlayerName showLevel={false} player={player} />
                        {self && <small className="dota-self-badge">Tú</small>}
                      </h4>
                      <p>
                        {team === "radiant" ? "Radiant" : "Dire"}
                        {Number.isFinite(player.elo) && (
                          <> · {player.elo.toLocaleString("en-US")} ELO</>
                        )}
                      </p>
                    </div>
                    <PlayerDotaMedal player={player} />
                    {!late && (
                      <div className="dota-participant-status" role="status">
                        <span>
                          {status.kind === "wrong" ? (
                            <TriangleAlert size={13} />
                          ) : status.verified ? (
                            <ShieldCheck size={13} />
                          ) : (
                            <span className="dota-status-dot" />
                          )}
                          {view.stage === "preparing"
                            ? "Participación confirmada"
                            : status.label}
                        </span>
                        {view.stage !== "preparing" &&
                          (status.kind === "wrong" ||
                            status.kind === "unknown") && (
                            <p>
                              {self && status.kind === "wrong"
                                ? `Estás en el equipo incorrecto. ${status.detail}`
                                : status.detail}
                            </p>
                          )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {index === 0 && (
              <span className="dota-versus-label" aria-hidden="true">
                VS
              </span>
            )}
          </div>
        ))}
      </div>
      {!cancelling && view.allVerified && (
        <p className="dota-stage-success" role="status">
          <ShieldCheck size={16} />
          Todos están en el equipo asignado. El inicio continúa según las reglas
          de la sala.
        </p>
      )}
      {canAccess && (
        <section
          className="dota-lobby-access"
          aria-label="Acceso privado al lobby"
        >
          <header>
            <div>
              <p className="dashboard-eyebrow">Acceso al lobby</p>
              <h3>{currentAccess?.name ?? "Tu lobby de Dota 2"}</h3>
            </div>
            {currentAccess && (
              <button
                className="dota-copy-button"
                onClick={() => void copy(currentAccess.name, "Nombre")}
              >
                <Copy size={14} />
                Copiar nombre
              </button>
            )}
          </header>
          {currentAccess ? (
            <>
              <div className="dota-access-fields">
                <div>
                  <span>Tu equipo</span>
                  <strong>
                    {currentAccess.team === "RADIANT" ? "Radiant" : "Dire"}
                  </strong>
                </div>
                <div className="dota-password-field">
                  <span>Contraseña</span>
                  <div>
                    <code>{visible ? currentAccess.password : "••••••••"}</code>
                    <button
                      onClick={() => setVisibleKey(visible ? null : accessKey)}
                      aria-label={
                        visible ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                      aria-pressed={visible}
                    >
                      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      aria-label="Copiar contraseña"
                      className="dota-copy-button"
                      onClick={() =>
                        void copy(currentAccess.password, "Contraseña")
                      }
                    >
                      <Copy size={14} />
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>
              </div>
              <p className="dota-access-help">
                ¿No recibiste la invitación? Busca el lobby en Dota 2 e ingresa
                con estos datos.
              </p>
              {currentAccess.availability !== "CONFIRMED" && (
                <p className="dota-access-help">
                  Su disponibilidad actual está pendiente de reconfirmación.
                </p>
              )}
            </>
          ) : (
            <div className="dota-access-pending">
              <p>
                Los datos son privados para los participantes de este intento.
              </p>
              <button
                disabled={accessBusy}
                className="dota-copy-button"
                onClick={() => {
                  setAccessBusy(true);
                  void readAccess();
                }}
              >
                {accessBusy ? "Consultando…" : "Consultar acceso"}
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="dota-copy-notice">
              {notice}
            </p>
          )}
        </section>
      )}
      {!canAccess && lobbyId && !["playing", "result"].includes(view.stage) && (
        <p className="dota-access-help">
          Las credenciales del lobby están disponibles únicamente para sus
          participantes autorizados.
        </p>
      )}
    </section>
  );
}
