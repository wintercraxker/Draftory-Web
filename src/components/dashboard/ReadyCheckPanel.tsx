"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { DashboardDropdown } from "./Dropdown";

import { useEffect, useState } from "react";
import { Check, Circle, Clock } from "lucide-react";
import { allPlayers, type Action, type LobbyState } from "@/lib/rooms/engine";
import type { DemoRoomAction } from "@/lib/rooms/demo";
import { DashboardButton } from "./DashboardUi";
import { DashboardDialog } from "./DashboardDialog";
import { ReadyDemoActions } from "./RoomControls";

export function ReadyCheckPanel({
  state,
  actor,
  serverNow,
  onAction,
  demo,
  notice,
}: {
  state: LobbyState;
  actor: string;
  serverNow?: number;
  notice?: string;
  onAction: (action: Action) => void;
  demo?: {
    onActor: (id: string) => void;
    onDemo: (action: DemoRoomAction) => void;
  };
}) {
  const [dismissed, setDismissed] = useState<number | null>(null);
  const check = state.readyCheck;
  useEffect(() => {
    if (check?.status !== "PASSED") return;
    const timer = setTimeout(() => setDismissed(check.startedAt), 1200);
    return () => clearTimeout(timer);
  }, [check?.status, check?.startedAt]);
  if (!check || (check.status !== "PENDING" && dismissed === check.startedAt))
    return null;
  const pending = check.status === "PENDING";
  const passed = check.status === "PASSED";
  const remaining = Math.max(
    0,
    Math.ceil((check.expiresAt - (serverNow ?? check.startedAt)) / 1000),
  );
  const ready = check.readyPlayerIds.includes(actor);
  const participant = check.players.some((player) => player.id === actor);
  const missing = check.players.filter(
    (player) => !check.readyPlayerIds.includes(player.id),
  );
  return (
    <DashboardDialog
      wide
      dismissible={!pending}
      titleId="ready-check-title"
      onClose={() => setDismissed(check.startedAt)}
    >
      <div className="dashboard-panel ready-check-panel p-5 sm:p-7">
        <header className="text-center">
          <p className="dashboard-eyebrow">Ready Check</p>
          <h2
            id="ready-check-title"
            className="mt-3 text-2xl font-semibold tracking-tight"
          >
            {pending
              ? "Partida lista"
              : passed
                ? "✓ Todos listos"
                : check.status === "CANCELLED"
                  ? "Ready Check cancelado"
                  : "Ready Check fallido"}
          </h2>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            {pending
              ? "Confirma que estás listo para jugar."
              : passed
                ? `${check.players.length} / ${check.players.length} jugadores confirmados. Preparando la lobby de Dota.`
                : check.reason}
          </p>
        </header>
        <div className="ready-check-grid">
          <div className="ready-check-counter">
            <span className="dashboard-label">Listos</span>
            <strong>
              {check.readyPlayerIds.length}{" "}
              <span>/ {check.players.length}</span>
            </strong>
            {pending && (
              <>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <Clock size={12} />
                  Tiempo restante
                </span>
                <b className="mt-2 text-2xl font-medium tabular-nums">
                  00:{String(remaining).padStart(2, "0")}
                </b>
              </>
            )}
          </div>
          {(["radiant", "dire"] as const).map((side) => (
            <section
              key={side}
              className={`ready-check-team ready-check-${side}`}
            >
              <h3 className="dashboard-label mb-3">{side}</h3>
              <ul className="space-y-2">
                {check.players
                  .filter((player) => player.team === side)
                  .map((player) => {
                    const confirmed = check.readyPlayerIds.includes(player.id);
                    return (
                      <li
                        key={player.id}
                        className={`ready-check-player ${confirmed ? "ready-check-player-confirmed" : ""}`}
                      >
                        {confirmed ? <Check size={14} /> : <Circle size={12} />}
                        <span className="min-w-0 truncate">
                          <PlayerDisplayName
                            id={player.id}
                            name={player.name}
                          />
                        </span>
                        <span className="ml-auto text-[9px]">
                          {confirmed ? "Listo" : "Pendiente"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
        {!pending && !passed && (
          <>
            <p className="mb-2 text-center text-xs leading-6 text-zinc-400">
              No confirmaron:{" "}
              {missing.map((player) => player.name).join(" · ") ||
                "Ningún jugador pendiente"}
            </p>
            <p className="mb-4 text-center text-xs leading-6 text-zinc-400">
              El creador puede iniciar la partida nuevamente cuando todos estén
              listos. Todos deberán confirmar otra vez.
            </p>
          </>
        )}
        {notice && (
          <p
            role="status"
            className="mb-4 text-center text-xs leading-5 text-amber-200"
          >
            {notice}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {pending && participant && (
            <DashboardButton
              variant="success"
              size="md"
              className="min-w-44"
              disabled={ready}
              onClick={() => onAction({ type: "confirmReady" })}
            >
              {ready ? (
                <>
                  <Check size={15} />
                  Listo
                </>
              ) : (
                "Estoy listo"
              )}
            </DashboardButton>
          )}
          {pending && !participant && (
            <p className="text-xs text-zinc-500">
              Los participantes seleccionados están confirmando.
            </p>
          )}
          {!pending &&
            !passed &&
            actor === state.hostId &&
            state.phase === "READY" && (
              <button
                className="dashboard-primary-button"
                onClick={() => onAction({ type: "start" })}
              >
                Volver a intentar
              </button>
            )}
          {!pending && !passed && (
            <button
              className="dashboard-button px-4 py-2 text-xs"
              onClick={() => setDismissed(check.startedAt)}
            >
              Volver al lobby
            </button>
          )}
        </div>
        {demo && pending && participant && actor !== state.hostId && (
          <button
            className="mt-4 block w-full text-center text-[10px] text-zinc-500 hover:text-rose-200"
            onClick={() => onAction({ type: "leave" })}
          >
            Abandonar sala
          </button>
        )}
        {demo && pending && (
          <details className="mt-5 border-t border-zinc-800 pt-4">
            <summary className="cursor-pointer text-[10px] text-zinc-500">
              Herramientas demo
            </summary>
            <label className="mt-3 block text-xs text-zinc-500">
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
                onChange={(value) => demo.onActor(value)}
              />
            </label>
            {actor === state.hostId && (
              <ReadyDemoActions onDemo={demo.onDemo} />
            )}
          </details>
        )}
      </div>
    </DashboardDialog>
  );
}
