"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ThumbsUp, X } from "lucide-react";
import type { LobbyState, Action } from "@/lib/rooms/engine";
import { DashboardDialog } from "./DashboardDialog";
import { MatchRecognition } from "./MatchRecognition";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";
import { useRoomClock } from "./useLobbyPresentation";

export function CommendPanel({
  state,
  actor,
  now: serverNow,
  onAction,
  inline = true,
}: {
  state: LobbyState;
  actor: string;
  now?: number;
  onAction: (action: Action) => void | Promise<void>;
  inline?: boolean;
}) {
  const now = useRoomClock(state, serverNow);
  const match = state.completion;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const key = match ? `draftory-commend-seen:${match.id}:${actor}` : undefined;
  const participants = match ? [...match.radiant, ...match.dire] : [];
  const member = participants.some((player) => player.id === actor);
  const sent = match?.commends.find((vote) => vote.from === actor);
  const voting = !!match && !match.finalized && now < match.voteEndsAt;
  useEffect(() => {
    if (!key || !member || !voting || sent) return;
    const frame = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "seen");
      } catch {}
      setCandidate(null);
      setOpenKey(key);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, member, voting, sent]);
  if (!match || state.phase !== "FINISHED") return null;
  const recipient = participants.find(
    (player) => player.id === candidate && player.id !== actor,
  );
  const ownTeam = match.radiant.some((player) => player.id === actor)
    ? "radiant"
    : "dire";
  const close = () => {
    setOpenKey(null);
    setCandidate(null);
  };
  async function commend() {
    if (!match || !recipient || !voting || sent || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      setError("");
      await onAction({
        type: "commend",
        matchId: match.id,
        playerId: recipient.id,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo enviar el Commend.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const seconds = Math.max(0, Math.ceil((match.voteEndsAt - now) / 1000));
  return (
    <>
      {inline && <MatchRecognition match={match} />}
      {inline && member && voting && !sent && (
        <button
          className="dashboard-button mt-4 inline-flex items-center gap-2 px-3 py-2 text-xs"
          onClick={() => {
            setCandidate(null);
            setOpenKey(key!);
          }}
        >
          <ThumbsUp size={13} />
          Dar Commend
        </button>
      )}
      {openKey === key && member && (
        <DashboardDialog wide titleId="commend-title" onClose={close}>
          <div className="dashboard-panel p-5 sm:p-6">
            <header className="flex items-center justify-between gap-4">
              <div>
                <p className="dashboard-eyebrow">Partida finalizada · GG.</p>
                <h2 id="commend-title" className="dashboard-section-title mt-2">
                  {sent
                    ? "Commend enviado"
                    : "¿Alguien destacó en esta partida?"}
                </h2>
              </div>
              <button
                aria-label="Cerrar Commend"
                className="dashboard-button grid size-8 place-items-center"
                onClick={close}
              >
                <X size={15} />
              </button>
            </header>
            {sent ? (
              <div className="py-8 text-center">
                <Check size={24} className="mx-auto mb-3 text-violet-200" />
                <p className="text-sm text-zinc-200">
                  Le diste tu Commend a{" "}
                  {participants.find((player) => player.id === sent.to)?.name}.
                </p>
                <button
                  className="dashboard-button mt-5 px-4 py-2 text-xs"
                  onClick={close}
                >
                  Cerrar
                </button>
              </div>
            ) : voting ? (
              <>
                <p className="mt-3 text-xs leading-6 text-zinc-500">
                  Reconoce a un compañero o a un rival. Es opcional y no cambia
                  MMR, ELO ni XP.
                </p>
                <p className="mt-2 text-[10px] tabular-nums text-zinc-500">
                  Votación abierta · {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, "0")}
                </p>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  {(
                    [
                      ownTeam,
                      ownTeam === "radiant" ? "dire" : "radiant",
                    ] as const
                  ).map((team, index) => (
                    <section key={team}>
                      <h3 className="dashboard-label mb-3">
                        {index === 0 ? "Tu equipo" : "Equipo rival"}
                      </h3>
                      <div className="space-y-2">
                        {match[team]
                          .filter((player) => player.id !== actor)
                          .map((player) => (
                            <div
                              key={player.id}
                              className={`commend-player ${candidate === player.id ? "commend-player-selected" : ""}`}
                            >
                              <PlayerAvatar player={player} />
                              <PlayerName
                                showLevel={false}
                                player={player}
                                className="min-w-0 flex-1 truncate text-xs font-semibold"
                              />
                              <button
                                className="dashboard-button px-2 py-1.5 text-[10px]"
                                disabled={busy}
                                aria-pressed={candidate === player.id}
                                onClick={() => setCandidate(player.id)}
                              >
                                Commend
                              </button>
                            </div>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
                {recipient && (
                  <div className="room-pick-confirmation">
                    <p>
                      ¿Dar tu Commend a <strong>{recipient.name}</strong>?
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="dashboard-button px-3 py-2 text-xs"
                        disabled={busy}
                        onClick={() => setCandidate(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        className="dashboard-primary-button"
                        disabled={busy}
                        onClick={() => void commend()}
                      >
                        {busy ? "Enviando…" : "Dar Commend"}
                      </button>
                    </div>
                  </div>
                )}
                <footer className="mt-5 flex justify-end">
                  <button
                    className="dashboard-button px-3 py-2 text-xs"
                    onClick={close}
                  >
                    Ahora no
                  </button>
                </footer>
              </>
            ) : (
              <div className="py-6">
                <p className="text-sm text-zinc-400">
                  El período de Commend ha terminado.
                </p>
                <MatchRecognition match={match} />
                <button
                  className="dashboard-button mt-4 px-3 py-2 text-xs"
                  onClick={close}
                >
                  Cerrar
                </button>
              </div>
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
