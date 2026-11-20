"use client";
import { useRef, useState, useEffect } from "react";
import {
  Diamond,
  X,
  Check,
  Clock,
  Lock,
  Minus,
  Plus,
  ArrowRight,
} from "lucide-react";
import { pointsConfig } from "@/lib/progression/config";
import { demoMatchCommand } from "@/lib/demo-match-service";
import {
  predictionTime,
  type AccountData,
  type PredictionWindow,
} from "./useDraftoryAccount";
import { DashboardButton, EmptyState } from "./DashboardUi";
import { DashboardDialog } from "./DashboardDialog";
import { matchElapsed } from "./LiveMatchCard";
import { PredictionHistory } from "./PredictionHistory";
const labels: Record<string, string> = {
  VICTORY: "Victoria",
  DEFEAT: "Partida completada",
  MATCH_WIN: "Victoria",
  MATCH_LOSS: "Partida completada",
  ACHIEVEMENT: "Logro desbloqueado",
  ADMIN_ADJUSTMENT: "Ajuste administrativo",
  PREDICTION_STAKE: "Predicción confirmada",
  PREDICTION_WIN: "Predicción acertada",
  PREDICTION_REFUND: "Predicción anulada · devolución",
};
export type PointsView = {
  points: number | string;
  entries: {
    id: string;
    type: string;
    amount: number | string;
    date: number;
  }[];
  weeklyGained?: string;
  totalStaked?: string;
};
export function PointsMovements({ account }: { account: PointsView }) {
  return (
    <div className="competitive-table points-movements">
      {account.entries.map((entry) => (
        <div key={entry.id} className="points-entry">
          <strong
            className={
              BigInt(entry.amount) > BigInt(0)
                ? "text-emerald-200"
                : "text-zinc-400"
            }
          >
            {BigInt(entry.amount) > BigInt(0) ? "+" : ""}
            {BigInt(entry.amount).toLocaleString("en-US")}
          </strong>
          <p className="text-xs text-zinc-400">{labels[entry.type]}</p>
          <time className="text-[10px] text-zinc-500">
            {new Date(entry.date).toLocaleString("es-CO", {
              timeZone: "America/Bogota",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
      ))}
      {!account.entries.length && (
        <EmptyState
          compact
          icon={Diamond}
          title="No hay movimientos todavía."
          description="Tus recompensas y predicciones aparecerán aquí."
        />
      )}
    </div>
  );
}
export function PointsPopover({
  account,
  onClose,
  onHistory,
  onPredictions,
  serverNow = 0,
}: {
  account: PointsView;
  onClose: () => void;
  onHistory: () => void;
  onPredictions?: () => void;
  serverNow?: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".dashboard-points-button")
      )
        closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        document
          .querySelector<HTMLButtonElement>(".dashboard-points-button")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const local = new Date(serverNow - 5 * 3600000);
  const weekStart =
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - ((local.getUTCDay() + 6) % 7),
    ) +
    5 * 3600000;
  const gained = account.entries
      .filter(
        (entry) => BigInt(entry.amount) > BigInt(0) && entry.date >= weekStart,
      )
      .reduce((sum, entry) => sum + BigInt(entry.amount), BigInt(0)),
    used = -account.entries
      .filter((entry) => BigInt(entry.amount) < BigInt(0))
      .reduce((sum, entry) => sum + BigInt(entry.amount), BigInt(0));
  return (
    <div
      ref={ref}
      className="points-popover dashboard-panel"
      aria-label="Puntos Draftory"
    >
      <div className="flex justify-between">
        <p className="dashboard-eyebrow">Puntos Draftory</p>
        <DashboardButton
          variant="ghost"
          size="icon"
          aria-label="Cerrar saldo"
          onClick={onClose}
        >
          <X size={14} />
        </DashboardButton>
      </div>
      <p className="dashboard-label mt-3">Saldo actual</p>
      <p className="my-3 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        <Diamond size={18} className="text-violet-200" />
        {BigInt(account.points).toLocaleString("en-US")}
      </p>
      <dl className="points-totals">
        <div>
          <dt>Esta semana</dt>
          <dd>
            +{BigInt(account.weeklyGained ?? gained).toLocaleString("en-US")}
          </dd>
        </div>
        <div>
          <dt>Predicciones</dt>
          <dd>
            −{BigInt(account.totalStaked ?? used).toLocaleString("en-US")}
          </dd>
        </div>
      </dl>
      <p className="dashboard-label mb-2 mt-4">Últimos movimientos</p>
      {account.entries.slice(0, 4).map((entry) => (
        <div key={entry.id} className="flex justify-between gap-3 py-2 text-xs">
          <span className="text-zinc-400">{labels[entry.type]}</span>
          <strong
            className={
              BigInt(entry.amount) > BigInt(0)
                ? "text-emerald-200"
                : "text-zinc-300"
            }
          >
            {BigInt(entry.amount) > BigInt(0) ? "+" : ""}
            {entry.amount}
          </strong>
        </div>
      ))}
      {!account.entries.length && (
        <p className="text-xs text-zinc-500">
          Juega para obtener tus primeros puntos.
        </p>
      )}
      <DashboardButton
        variant="ghost"
        className="mt-3 w-full"
        onClick={onHistory}
      >
        Ver movimientos
        <ArrowRight size={13} />
      </DashboardButton>
      {onPredictions && (
        <DashboardButton
          variant="ghost"
          className="mt-1 w-full"
          onClick={onPredictions}
        >
          Ir a Predicciones
          <ArrowRight size={13} />
        </DashboardButton>
      )}
    </div>
  );
}
export function PointsPanel({
  account,
  windows,
  serverNow,
  token,
  onAccount,
  onClose,
  initialTab = "history",
  initialMatchId,
  onRefresh,
}: {
  account: AccountData;
  windows: PredictionWindow[];
  serverNow: number;
  token: string;
  onAccount: (value: AccountData) => void;
  onClose: () => void;
  initialTab?: "history" | "predictions";
  initialMatchId?: string;
  onRefresh?: () => Promise<void>;
}) {
  const [side, setSide] = useState<"radiant" | "dire">("radiant"),
    [amount, setAmount] = useState(pointsConfig.minPrediction),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const selected = windows.find((window) => window.id === initialMatchId),
    mine = account.predictions.find(
      (ticket) => ticket.matchId === initialMatchId,
    );
  const ownMatch =
    selected &&
    [...selected.radiant, ...selected.dire].some(
      (player) => player.id === "self",
    );
  const open =
    !!selected &&
    serverNow >= selected.startedAt &&
    serverNow < selected.closesAt;
  const validAmount =
    Number.isSafeInteger(amount) &&
    amount >= pointsConfig.minPrediction &&
    amount <= account.points;
  const total =
    validAmount && selected ? Math.floor(amount * selected.quote[side]) : 0;
  async function request(body: object) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await demoMatchCommand(token, body);
      onAccount(value.account);
      await onRefresh?.();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "No se pudo confirmar.",
      );
      await onRefresh?.();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const teams = selected?.name.split(/\s+vs\.?\s+/i);
  return (
    <DashboardDialog
      wide={initialTab === "predictions"}
      titleId="points-title"
      dismissible={!busy}
      onClose={onClose}
    >
      <div className="dashboard-panel p-5 sm:p-6">
        <header className="flex justify-between gap-4">
          <div>
            <p className="dashboard-eyebrow">
              {initialTab === "predictions" ? "Predicción" : "Puntos Draftory"}
            </p>
            <h2 id="points-title" className="dashboard-section-title mt-2">
              {selected?.name ?? mine?.matchName ?? "Historial de puntos"}
            </h2>
          </div>
          <DashboardButton
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label="Cerrar puntos"
            onClick={onClose}
          >
            <X size={15} />
          </DashboardButton>
        </header>
        {initialTab === "history" ? (
          <>
            <dl className="mt-4 mb-5">
              <dt className="dashboard-label">Saldo actual</dt>
              <dd className="mt-2 text-xl">
                <Diamond className="inline mr-2" size={16} />
                {BigInt(account.points).toLocaleString("en-US")}
              </dd>
            </dl>
            <PointsMovements account={account} />
          </>
        ) : (
          <>
            {selected && (
              <>
                <div className="prediction-live-time">
                  <span>
                    ● EN VIVO · {matchElapsed(selected.startedAt, serverNow)}
                  </span>
                  <span className="prediction-deadline">
                    {open ? (
                      <>
                        <Clock size={12} />
                        Cierran en{" "}
                        {predictionTime(selected.closesAt, serverNow)}
                      </>
                    ) : (
                      <>
                        <Lock size={12} />
                        Predicciones cerradas
                      </>
                    )}
                  </span>
                </div>
                <div className="prediction-team-summary">
                  {(["radiant", "dire"] as const).map((team, index) => (
                    <section key={team} data-team={team}>
                      <p className="dashboard-label">{team}</p>
                      <h3>
                        {teams?.length === 2
                          ? teams[index]
                          : team === "radiant"
                            ? "Radiant"
                            : "Dire"}
                      </h3>
                      <dl>
                        <div>
                          <dt>Probabilidad estimada</dt>
                          <dd>
                            {Math.round(
                              selected.quote[
                                team === "radiant"
                                  ? "radiantProbability"
                                  : "direProbability"
                              ] * 100,
                            )}
                            %
                          </dd>
                        </div>
                        <div>
                          <dt>Cuota</dt>
                          <dd>{selected.quote[team].toFixed(2)}</dd>
                        </div>
                      </dl>
                    </section>
                  ))}
                </div>
              </>
            )}
            {mine ? (
              mine.status === "PENDING" ? (
                <div className="prediction-ticket">
                  <Check size={18} />
                  <div>
                    <p className="dashboard-eyebrow">Predicción registrada</p>
                    <strong>
                      {mine.team.toUpperCase()} · {mine.amount} pts @{" "}
                      {mine.odds.toFixed(2)}
                    </strong>
                    <p>
                      Retorno potencial: {Math.floor(mine.amount * mine.odds)}{" "}
                      pts. Tu cuota queda bloqueada.
                    </p>
                    <p>Esperando resultado…</p>
                  </div>
                </div>
              ) : (
                <PredictionHistory tickets={[mine]} />
              )
            ) : ownMatch ? (
              <p className="mt-5 text-xs text-zinc-400">
                No puedes hacer una predicción sobre una partida en la que
                participas.
              </p>
            ) : selected && open ? (
              <form
                className="prediction-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (validAmount)
                    void request({
                      matchId: selected.id,
                      team: side,
                      amount,
                      odds: selected.quote[side],
                    });
                }}
              >
                <p className="dashboard-label">Elige ganador</p>
                <div className="prediction-sides">
                  {(["radiant", "dire"] as const).map((team) => (
                    <button
                      type="button"
                      key={team}
                      disabled={busy}
                      aria-pressed={side === team}
                      data-team={team}
                      onClick={() => setSide(team)}
                    >
                      <span>
                        {team}
                        {side === team && (
                          <Check size={12} className="inline ml-2" />
                        )}
                      </span>
                      <strong>{selected.quote[team].toFixed(2)}</strong>
                    </button>
                  ))}
                </div>
                <label className="dashboard-label" htmlFor="prediction-stake">
                  Puntos
                </label>
                <div className="prediction-stake-row">
                  <div className="prediction-amount">
                    <DashboardButton
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      aria-label="Restar diez puntos"
                      onClick={() =>
                        setAmount((value) =>
                          Math.max(pointsConfig.minPrediction, value - 10),
                        )
                      }
                    >
                      <Minus size={14} />
                    </DashboardButton>
                    <input
                      id="prediction-stake"
                      type="number"
                      disabled={busy}
                      min={pointsConfig.minPrediction}
                      max={account.points}
                      step={1}
                      value={amount}
                      onChange={(event) =>
                        setAmount(Number(event.target.value))
                      }
                    />
                    <DashboardButton
                      variant="ghost"
                      size="icon"
                      disabled={
                        busy || account.points < pointsConfig.minPrediction
                      }
                      aria-label="Sumar diez puntos"
                      onClick={() =>
                        setAmount((value) =>
                          Math.min(account.points, value + 10),
                        )
                      }
                    >
                      <Plus size={14} />
                    </DashboardButton>
                  </div>
                  <p>
                    <Diamond size={13} />
                    {BigInt(account.points).toLocaleString("en-US")} disponibles
                  </p>
                </div>
                <dl className="prediction-estimate">
                  <div>
                    <dt>Puntos utilizados</dt>
                    <dd>{amount}</dd>
                  </div>
                  <div>
                    <dt>Ganancia potencial</dt>
                    <dd>{validAmount ? `+${total - amount}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Retorno total</dt>
                    <dd>{validAmount ? `${total} pts` : "—"}</dd>
                  </div>
                </dl>
                <p className="text-[10px] leading-5 text-zinc-500">
                  La cuota se bloquea al confirmar. Si cambia, tendrás que
                  revisar y confirmar de nuevo.
                </p>
                <DashboardButton
                  type="submit"
                  variant="primary"
                  size="md"
                  busy={busy}
                  disabled={!token || !validAmount}
                >
                  Confirmar predicción
                </DashboardButton>
                {account.points < pointsConfig.minPrediction && (
                  <p className="text-xs text-zinc-400">
                    Necesitas al menos {pointsConfig.minPrediction} puntos. Se
                    obtienen jugando partidas.
                  </p>
                )}
              </form>
            ) : (
              <p className="mt-5 text-xs text-zinc-500">
                {selected
                  ? "No se aceptan nuevas predicciones."
                  : "Esta partida ya no está disponible para predecir."}
              </p>
            )}
            {selected?.demo && (
              <div className="prediction-demo-tools">
                <p className="dashboard-label">Solo demo · reloj y resultado</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DashboardButton
                    busy={busy}
                    onClick={() =>
                      void request({
                        type: "demoAdvance",
                        matchId: selected.id,
                        seconds: 60,
                      })
                    }
                  >
                    Avanzar 1 minuto
                  </DashboardButton>
                  <DashboardButton
                    busy={busy}
                    onClick={() =>
                      void request({
                        type: "demoAdvance",
                        matchId: selected.id,
                        seconds: 300,
                      })
                    }
                  >
                    Cerrar ventana (+5 min)
                  </DashboardButton>
                  {(["radiant", "dire"] as const).map((team) => (
                    <DashboardButton
                      key={team}
                      busy={busy}
                      onClick={() =>
                        void request({
                          type: "demoResolve",
                          matchId: selected.id,
                          winningTeam: team,
                        })
                      }
                    >
                      Victoria {team === "radiant" ? "Radiant" : "Dire"}
                    </DashboardButton>
                  ))}
                  <DashboardButton
                    variant="danger"
                    busy={busy}
                    onClick={() =>
                      void request({ type: "demoCancel", matchId: selected.id })
                    }
                  >
                    Anular demo (8/10)
                  </DashboardButton>
                </div>
              </div>
            )}
            <p className="mt-5 text-[10px] text-zinc-500">
              Puntos internos de Draftory. Sin compras, retiros ni conversión a
              dinero.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 text-xs text-rose-200">
            {error}
          </p>
        )}
      </div>
    </DashboardDialog>
  );
}
