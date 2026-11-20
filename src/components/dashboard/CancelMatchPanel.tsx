"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, TriangleAlert } from "lucide-react";
import { DashboardButton } from "./DashboardUi";
import {
  canVoteCancel,
  type Action,
  type LobbyState,
} from "@/lib/rooms/engine";
import { roomConfig } from "@/lib/rooms/config";
import { roomFormat } from "@/lib/rooms/lobby-options.mjs";
import { DashboardDialog } from "./DashboardDialog";
import { PlayerName, PlayerAvatar } from "./PlayerIdentity";

export function CancelMatchPanel({
  state,
  actor,
  now,
  onAction,
}: {
  state: LobbyState;
  actor: string;
  now: number;
  onAction: (action: Action) => void | Promise<void>;
}) {
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const eligible = canVoteCancel(state, actor);
  const cleanupPending = state.continuation?.state === "WAITING_CLEANUP";
  const passed =
    state.cancelVote?.status === "PASSED" &&
    state.highlight?.kind === "cancelled" &&
    now < state.highlight.expiresAt;
  const voteIds = state.cancelVote?.voterIds ?? [];
  const requested =
    state.cancelVote?.status === "PASSED" && state.externalCancellationPending;
  useEffect(() => {
    if (state.cancelVote?.status !== "PASSED") return;
    const timer = setTimeout(
      () => setOpenAttempt(null),
      roomConfig.statusHighlightMs,
    );
    return () => clearTimeout(timer);
  }, [state.cancelVote?.status]);
  async function vote() {
    if (
      !eligible ||
      !state.attempt ||
      pending.current ||
      voteIds.includes(actor)
    )
      return;
    pending.current = true;
    setBusy(true);
    try {
      setError("");
      await onAction({ type: "voteCancel", attemptId: state.attempt.id });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo registrar el voto.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {(eligible || requested) && (
        <DashboardButton
          variant="danger"
          onClick={() => setOpenAttempt(state.attempt!.id)}
        >
          <TriangleAlert size={13} />
          {requested ? "Cancelación solicitada" : "Cancelar partida"}
          {voteIds.length > 0 && (
            <span className="ml-2 tabular-nums text-emerald-300">
              {voteIds.length}/{roomFormat(state.mode).cancellationVotes!}
            </span>
          )}
        </DashboardButton>
      )}
      {openAttempt === state.attempt?.id &&
        (eligible || passed || requested) && (
          <DashboardDialog
            titleId="cancel-match-title"
            onClose={() => setOpenAttempt(null)}
          >
            <div className="dashboard-panel p-5 sm:p-6">
              <header className="flex items-center justify-between gap-4">
                <h2 id="cancel-match-title" className="dashboard-section-title">
                  {requested
                    ? "Cancelación solicitada"
                    : passed
                      ? cleanupPending
                        ? "Cierre pendiente"
                        : "Partida cancelada"
                      : "Solicitar cancelación"}
                </h2>
                <button
                  aria-label="Cerrar votación"
                  className="dashboard-button grid size-8 place-items-center"
                  onClick={() => setOpenAttempt(null)}
                >
                  <X size={14} />
                </button>
              </header>
              {passed ? (
                <div className="py-8 text-center">
                  <Check className="mx-auto mb-3 text-emerald-300" size={24} />
                  <p className="text-sm text-zinc-200">
                    {roomFormat(state.mode).cancellationVotes!} jugadores
                    aprobaron la cancelación.
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {cleanupPending
                      ? "Esperando confirmación de cierre. Todavía no puedes reiniciar."
                      : "Puedes volver a iniciar con los mismos jugadores."}
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    Se conservan jugadores, equipos, capitanes y picks.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-4 text-sm text-zinc-300">
                    {requested
                      ? "Esperando confirmación de cierre. Todavía no puedes reiniciar."
                      : "¿Quieres solicitar la cancelación de este intento?"}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-zinc-500">
                    Si {roomFormat(state.mode).cancellationVotes!} de los{" "}
                    {roomFormat(state.mode).players} participantes votan a
                    favor,
                    {state.externalCancellationPending
                      ? "se aprobará la cancelación y se solicitará la salida del bot. El bot estará ocupado hasta recibir una confirmación válida de GC."
                      : "este intento se cancelará y podrán volver a iniciar cuando se confirme la salida del bot."}
                  </p>
                  <div className="my-5 flex items-baseline justify-between border-y border-zinc-800 py-4">
                    <span className="dashboard-label">Votos para cancelar</span>
                    <strong className="text-2xl font-semibold tabular-nums text-violet-100">
                      {voteIds.length} /{" "}
                      {roomFormat(state.mode).cancellationVotes!}
                    </strong>
                  </div>
                  <div
                    className="cancel-vote-progress"
                    role="progressbar"
                    aria-label="Votos para cancelar"
                    aria-valuemin={0}
                    aria-valuemax={roomFormat(state.mode).cancellationVotes!}
                    aria-valuenow={voteIds.length}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (voteIds.length / roomFormat(state.mode).cancellationVotes!) * 100)}%`,
                      }}
                    />
                  </div>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[...state.radiant, ...state.dire].map((player) => (
                      <li
                        key={player.id}
                        className="flex min-w-0 items-center gap-2 text-xs text-zinc-400"
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${voteIds.includes(player.id) ? "bg-emerald-300" : "bg-zinc-700"}`}
                        />
                        <PlayerAvatar
                          player={player}
                          size={28}
                          className="cancel-participant-avatar rounded-lg"
                        />
                        <PlayerName player={player} className="truncate" />
                        {voteIds.includes(player.id) && (
                          <Check
                            size={12}
                            aria-label="Ya votó"
                            className="shrink-0 text-emerald-300"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                  <footer className="mt-6 flex flex-wrap justify-end gap-2">
                    <button
                      className="dashboard-button px-3 py-2 text-xs"
                      onClick={() => setOpenAttempt(null)}
                    >
                      Seguir jugando
                    </button>
                    <button
                      disabled={busy || voteIds.includes(actor) || requested}
                      className="hub-button hub-button-danger hub-button-sm"
                      onClick={() => void vote()}
                    >
                      {voteIds.includes(actor)
                        ? "Ya votaste"
                        : busy
                          ? "Enviando…"
                          : "Votar para cancelar"}
                    </button>
                  </footer>
                </>
              )}
              {error && (
                <p role="status" className="mt-3 text-xs text-zinc-400">
                  {error}
                </p>
              )}
            </div>
          </DashboardDialog>
        )}
    </>
  );
}
