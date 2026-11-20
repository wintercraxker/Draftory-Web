"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { useRef, useState } from "react";
import {
  Diamond,
  Minus,
  Plus,
  Clock,
  Lock,
  Target,
  Swords,
  X,
  ArrowUpRight,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { AccountData, PredictionWindow } from "./useDraftoryAccount";
import { predictionTime } from "./useDraftoryAccount";
import { matchElapsed } from "./LiveMatchCard";
import type { PredictionView } from "./PredictionHistory";
import type { PointsView } from "./PointsPanel";
import { PredictionHistory } from "./PredictionHistory";
import { PointsMovements } from "./PointsPanel";
import {
  PageHeader,
  DashboardCard,
  DashboardButton,
  DashboardSkeleton,
  LoadError,
  EmptyState,
} from "./DashboardUi";
function LegacyPredictionsPanel({
  account,
  windows,
  now,
  loading,
  error,
  onRetry,
  onPredict,
  onDemo,
  admissionPending,
}: {
  admissionPending?: string;
  account: Omit<AccountData, "points" | "entries" | "predictions"> &
    PointsView & { predictions: PredictionView[] };
  windows: PredictionWindow[];
  now: number;
  loading?: boolean;
  error?: string;
  onRetry: () => void;
  onPredict: (id: string) => void;
  onDemo?: () => void;
}) {
  const [tab, setTab] = useState("available");
  const pending = account.predictions.filter(
      (ticket) => ticket.status === "PENDING",
    ),
    finished = account.predictions.filter(
      (ticket) => ticket.status !== "PENDING",
    );
  const available = windows.filter(
    (window) =>
      ![...window.radiant, ...window.dire].some(
        (player) => player.id === "self",
      ),
  );
  return (
    <section className="dashboard-enter space-y-6">
      <PageHeader
        eyebrow="Predicciones"
        title="Pon a prueba tu lectura de la partida."
        description="Utiliza tus Puntos Draftory y sigue tus resultados."
        action={
          <div className="prediction-balance">
            <span className="dashboard-label">Saldo</span>
            <strong>
              <Diamond size={18} />
              {BigInt(account.points).toLocaleString("en-US")} puntos
            </strong>
          </div>
        }
      />
      <div className="dashboard-tabs" aria-label="Vistas de predicciones">
        {[
          { id: "available", label: "Disponibles" },
          { id: "mine", label: "Mis predicciones" },
          { id: "history", label: "Historial" },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <LoadError message={error} onRetry={onRetry} />}
      {loading ? (
        <DashboardSkeleton variant="predictions" />
      ) : tab === "history" ? (
        <section className="dashboard-panel p-5">
          <h2 className="dashboard-section-title mb-4">
            Movimientos de puntos
          </h2>
          <PointsMovements account={account} />
        </section>
      ) : tab === "mine" ? (
        <div className="space-y-5">
          <section className="dashboard-panel p-5">
            <h2 className="dashboard-section-title mb-4">En curso</h2>
            <PredictionHistory
              admissionPending={admissionPending}
              tickets={pending}
            />
          </section>
          <section className="dashboard-panel p-5">
            <h2 className="dashboard-section-title mb-4">Finalizadas</h2>
            <PredictionHistory
              admissionPending={admissionPending}
              tickets={finished}
            />
          </section>
        </div>
      ) : (
        <div className="dashboard-live-matches">
          {available.map((window) => {
            const open = now >= window.startedAt && now < window.closesAt,
              ticket = account.predictions.find(
                (value) => value.matchId === window.id,
              ),
              names = window.name.split(/\s+vs\.?\s+/i);
            return (
              <DashboardCard
                key={window.id}
                variant="live"
                className="prediction-discovery-card"
              >
                <header>
                  <span className="dashboard-room-status dashboard-status-live">
                    ● EN VIVO
                  </span>
                  <span className="match-elapsed">
                    {matchElapsed(window.startedAt, now)}
                  </span>
                </header>
                <div className="prediction-discovery-teams">
                  {(["radiant", "dire"] as const).map((side, index) => (
                    <div key={side}>
                      <h2 title={names[index]}>
                        {names.length === 2
                          ? names[index]
                          : side === "radiant"
                            ? "Radiant"
                            : "Dire"}
                      </h2>
                      <p className="dashboard-label">{side}</p>
                      <strong>{window.quote[side].toFixed(2)}</strong>
                      <small>Cuota</small>
                    </div>
                  ))}
                </div>
                {ticket ? (
                  <div className="compact-prediction-state">
                    <p className="dashboard-label">Tu predicción</p>
                    <strong>
                      {ticket.team === "radiant"
                        ? names[0]
                        : (names[1] ?? "Dire")}{" "}
                      · {ticket.amount} pts @ {ticket.odds.toFixed(2)}
                    </strong>
                    <p>Esperando resultado…</p>
                    <DashboardButton
                      className="mt-3"
                      variant="ghost"
                      onClick={() => onPredict(window.id)}
                    >
                      Ver predicción registrada
                    </DashboardButton>
                  </div>
                ) : (
                  <>
                    <p className="prediction-deadline">
                      {open ? <Clock size={12} /> : <Lock size={12} />}
                      {open
                        ? `Cierran en ${predictionTime(window.closesAt, now)}`
                        : "Predicciones cerradas"}
                    </p>
                    {open && (
                      <DashboardButton
                        className="mt-4"
                        variant="primary"
                        onClick={() => onPredict(window.id)}
                      >
                        Predecir
                      </DashboardButton>
                    )}
                  </>
                )}
              </DashboardCard>
            );
          })}
          {!available.length && (
            <EmptyState
              icon={Diamond}
              title="No hay partidas disponibles para predecir."
              description={
                admissionPending ??
                "Aquí aparecen partidas de las que eres observador. La ventana abre durante los primeros cinco minutos."
              }
              action={
                onDemo && (
                  <DashboardButton onClick={onDemo}>
                    Crear partida demo
                  </DashboardButton>
                )
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

// The live account uses persisted free forecasts. Historical demo components remain isolated.
import type { RealPredictions as FreeData } from "@/lib/real/predictions-repository";
import Link from "next/link";
import {
  predictionAmount,
  predictionReturn,
  predictionPointsPolicy,
} from "@/lib/progression/prediction-points";

import styles from "./PredictionsPanel.module.css";
import { DashboardDialog } from "./DashboardDialog";
type FreeProps = {
  balance?: string;
  free: FreeData | undefined;
  error: string;
  message: string;
  loading: boolean;
  busy: string | null;
  now: number;
  onRetry: () => void;
  onSubmit: (
    matchId: string,
    team: "RADIANT" | "DIRE",
    points: string,
  ) => Promise<boolean>;
};
export function PredictionsPanel(
  props: React.ComponentProps<typeof LegacyPredictionsPanel> | FreeProps,
) {
  return "free" in props ? (
    <FreePredictions {...props} />
  ) : (
    <LegacyPredictionsPanel {...props} />
  );
}
const modeLabel = (value: string) =>
  ({
    ALL_PICK: "All Pick",
    CAPTAINS_MODE: "Captain’s Mode",
    TURBO: "Turbo",
    ONE_V_ONE_MID: "Solo Mid 1v1",
  })[value] ?? value;
const statusLabel = {
  PENDING: "Pendiente",
  WON: "Acertado",
  LOST: "Fallido",
  VOID: "Anulado",
};
const regionLabel = (value: string) =>
  ({
    PERU: "Perú",
    CHILE: "Chile",
    US_EAST: "EE. UU. Este",
    US_WEST: "EE. UU. Oeste",
    EUROPE: "Europa",
  })[value] ?? value;
function FreePredictions({
  free,
  balance,
  error,
  message,
  loading,
  busy,
  now,
  onRetry,
  onSubmit,
}: FreeProps) {
  const [choices, setChoices] = useState<Record<string, "RADIANT" | "DIRE">>(
    {},
  );
  const [amounts, setAmounts] = useState<Record<string, string>>({}),
    [amountInputError, setAmountInputError] = useState("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<
    FreeData["available"][number] | null
  >(null);
  const [confirmed, setConfirmed] = useState<
    Record<string, "RADIANT" | "DIRE">
  >({});
  const active = selected
    ? (free?.available.find((m) => m.id === selected.id) ?? {
        ...selected,
        name: "Partida no disponible",
        teams: selected.teams.map((t) => ({
          ...t,
          name: t.side === "RADIANT" ? "Radiant" : "Dire",
          players: [],
        })),
      })
    : null;
  const registeredTicket =
    active && free?.tickets.find((t) => t.matchId === active.id);
  const registered =
    active &&
    (confirmed[active.id] ??
      active.selection ??
      free?.tickets.find((t) => t.matchId === active.id)?.team);
  const remaining =
    active && free?.available.some((m) => m.id === active.id)
      ? Math.max(0, Math.ceil((Date.parse(active.closesAt) - now) / 1000))
      : 0;
  const amountText = active ? (amounts[active.id] ?? "10") : "10";
  const amount = predictionAmount(amountText),
    available = balance === undefined ? null : BigInt(balance);
  const amountError =
    amountInputError ||
    (!amountText
      ? "Introduce una cantidad de puntos."
      : amount === null
        ? `Usa enteros entre 1 y ${predictionPointsPolicy.maximum.toLocaleString("es-ES")}, sin signos ni decimales.`
        : available === null
          ? "Comprobando saldo…"
          : amount > available
            ? "No tienes puntos suficientes para esta cantidad."
            : "");
  const total = amount === null ? null : predictionReturn(amount);
  const formatPoints = (n: bigint | string) =>
    BigInt(n).toLocaleString("es-ES");
  const setAmount = (value: string) => {
    if (!active) return;
    if (!/^\d*$/.test(value)) {
      setAmountInputError(
        "Usa solo números enteros, sin letras, signos ni decimales.",
      );
      return;
    }
    setAmountInputError("");
    setAmounts((v) => ({ ...v, [active.id]: value }));
  };
  const close = () => {
    if (!busy) {
      setSelected(null);
      requestAnimationFrame(() => opener.current?.focus());
    }
  };
  const [historyView, setHistoryView] = useState({ filter: "ALL", page: 0 });
  const summary = free?.summary;
  const history = (free?.tickets ?? []).filter(
    (t) => historyView.filter === "ALL" || t.status === historyView.filter,
  );
  const pages = Math.max(1, Math.ceil(history.length / 5)),
    page = Math.min(historyView.page, pages - 1);
  const number = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString("es-PE");
  return (
    <section data-free-predictions className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}>
            <Target size={24} aria-hidden="true" />
          </span>
          <div>
            <p className={styles.eyebrow}>PREDICCIONES</p>
            <h1>Anticipa la victoria.</h1>
            <p className={styles.intro}>
              Analiza los enfrentamientos, elige a tu favorito y demuestra
              cuánto sabes de Dota 2.
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {free && (
            <span
              className={styles.openCount}
              data-open={free.available.length > 0}
            >
              <span />
              {free.available.length}{" "}
              {free.available.length === 1
                ? "partida disponible"
                : "partidas disponibles"}
            </span>
          )}
          <a href="#forecast-history" className={styles.historyJump}>
            Mis pronósticos <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </header>
      {error && <LoadError message={error} onRetry={onRetry} />}
      {message && (
        <p className={styles.notice} role="status">
          <Check size={16} aria-hidden="true" />
          {message}
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.main}>
          <section aria-labelledby="forecast-available-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>ELIGE TU LADO</p>
                <h2 id="forecast-available-title">Partidas disponibles</h2>
              </div>
              <span className={styles.windowNote}>
                <Clock size={13} aria-hidden="true" />
                Ventana de 5 minutos
              </span>
            </div>
            {loading ? (
              <DashboardSkeleton variant="predictions" />
            ) : !free?.available.length ? (
              <div className={styles.emptyArena} data-forecast-empty>
                <div className={styles.emptyDuel} aria-hidden="true">
                  <span>R</span>
                  <Swords size={26} />
                  <span>D</span>
                </div>
                <h3>Todavía no hay enfrentamientos disponibles</h3>
                <p>
                  Las próximas partidas aparecerán aquí cuando comience su
                  ventana de predicciones.
                </p>
                <Link href="/partidas?tab=live">
                  Explorar partidas en vivo{" "}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                <small>Solo puntos virtuales Draftory · Sin dinero real</small>
              </div>
            ) : (
              <div className={styles.matchGrid}>
                {free.available.map((m) => {
                  const remaining = Math.max(
                    0,
                    Math.ceil((Date.parse(m.closesAt) - now) / 1000),
                  );
                  return (
                    <article
                      key={m.id}
                      className={styles.matchCard}
                      data-forecast-match={m.id}
                    >
                      <div className={styles.matchMeta}>
                        <span>{modeLabel(m.mode)}</span>
                        <span>{regionLabel(m.region)}</span>
                        <span className={styles.live}>
                          <i />
                          En curso
                        </span>
                      </div>
                      <h3>{m.name}</h3>
                      <div className={styles.cardDuel}>
                        {m.teams.map((team, i) => (
                          <div key={team.side} data-side={team.side}>
                            {i === 1 && (
                              <span className={styles.cardVs}>VS</span>
                            )}
                            <small>{team.side}</small>
                            <strong>{team.name}</strong>
                          </div>
                        ))}
                      </div>
                      <div className={styles.cardPlayers}>
                        {m.teams.map((team) => (
                          <span key={team.side}>
                            {team.players.length}{" "}
                            {team.players.length === 1
                              ? "jugador"
                              : "jugadores"}
                          </span>
                        ))}
                      </div>
                      <div className={styles.matchFooter}>
                        <span
                          className={styles.countdown}
                          data-forecast-countdown
                        >
                          <Clock size={13} aria-hidden="true" />
                          {remaining
                            ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} para participar`
                            : "Predicciones cerradas"}
                        </span>
                        {m.canViewDetails && (
                          <Link
                            href={`/partidas/${m.id}`}
                            className={styles.details}
                          >
                            Ver detalles <ArrowUpRight size={12} />
                          </Link>
                        )}
                      </div>
                      <p
                        className={styles.cardState}
                        data-registered={!!m.selection}
                      >
                        {m.selection ? (
                          <>
                            <ShieldCheck size={15} />
                            <span>
                              Pronóstico registrado:{" "}
                              {m.selection === "RADIANT" ? "Radiant" : "Dire"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Target size={15} />
                            <span>
                              {remaining
                                ? "Tu elección aún está pendiente"
                                : "Ventana de participación cerrada"}
                            </span>
                          </>
                        )}
                      </p>
                      <button
                        className={styles.confirmButton}
                        data-open-forecast
                        onClick={(e) => {
                          opener.current = e.currentTarget;
                          setSelected(m);
                        }}
                      >
                        {m.selection
                          ? "Ver mi pronóstico"
                          : remaining
                            ? "Predecir ganador"
                            : "Ver enfrentamiento"}
                        <ArrowUpRight size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <section
            className={styles.compactPerformance}
            aria-label="Mi rendimiento"
          >
            <div>
              <h2>Mi rendimiento</h2>
              <p>Conocimiento de Dota 2 · Independiente del ELO</p>
            </div>
            <dl>
              {[
                ["Realizados", summary?.total],
                ["Aciertos", summary?.won],
                ["Fallos", summary?.lost],
                [
                  "Precisión",
                  summary?.accuracy == null ? "—" : `${summary.accuracy}%`,
                ],
                ["Racha", summary?.currentStreak],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <small>Los pronósticos no modifican tu ELO ni tu XP.</small>
          </section>
          <section
            className={styles.history}
            id="forecast-history"
            aria-labelledby="forecast-history-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>CADA ELECCIÓN CUENTA</p>
                <h2 id="forecast-history-title">Mis predicciones</h2>
              </div>
              {summary && (
                <span className={styles.historyTotal}>
                  {number(summary.total)} realizadas
                </span>
              )}
            </div>
            <div className={styles.filters} aria-label="Filtrar pronósticos">
              {[
                ["ALL", "Todos"],
                ["PENDING", "Pendientes"],
                ["WON", "Acertados"],
                ["LOST", "Fallidos"],
                ["VOID", "Anulados"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={historyView.filter === id}
                  onClick={() => setHistoryView({ filter: id, page: 0 })}
                >
                  {label}
                </button>
              ))}
            </div>
            {loading ? (
              <p role="status" className={styles.muted}>
                Cargando tu historial…
              </p>
            ) : !history.length ? (
              <div className={styles.emptyHistory}>
                <Target size={20} aria-hidden="true" />
                <p>Aún no hay pronósticos en esta vista.</p>
                <small>
                  Tus elecciones y sus resultados verificados se guardarán aquí.
                </small>
              </div>
            ) : (
              <div className={styles.ticketList}>
                {history.slice(page * 5, page * 5 + 5).map((t) => (
                  <article
                    key={t.id}
                    className={styles.ticket}
                    data-forecast-status={t.status}
                  >
                    <div className={styles.ticketEncounter}>
                      <h3>{t.name}</h3>
                      <small>{modeLabel(t.mode)}</small>
                    </div>
                    <div className={styles.ticketPick}>
                      <small>Tu elección</small>
                      <b data-side={t.team}>
                        {t.team === "RADIANT" ? "Radiant" : "Dire"}
                      </b>
                    </div>
                    <p className={styles.ticketOutcome}>
                      {t.status === "VOID"
                        ? "Sin resultado"
                        : t.winningSide
                          ? `Ganó ${t.winningSide === "RADIANT" ? "Radiant" : "Dire"} · Verificado`
                          : "Resultado pendiente"}
                    </p>
                    <span className={styles.state} data-status={t.status}>
                      {statusLabel[t.status]}
                      <small className={styles.rewardStatus}>
                        {!t.usesPoints
                          ? "Pronóstico gratuito anterior"
                          : t.reward
                            ? `${t.status === "VOID" ? "Devueltos" : "Acreditados"} ${formatPoints(t.reward.amount)} puntos`
                            : t.status === "PENDING"
                              ? `${formatPoints(t.stakePoints)} puntos · Retorno ${formatPoints(t.potentialReturn)}`
                              : t.status === "LOST"
                                ? `${formatPoints(t.stakePoints)} puntos utilizados`
                                : "Sin movimiento pendiente"}
                      </small>
                    </span>
                    <time dateTime={t.createdAt}>
                      {new Date(t.createdAt).toLocaleString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {t.canViewDetails ? (
                      <Link
                        href={`/partidas/${t.matchId}`}
                        className={styles.details}
                      >
                        Ver detalles{" "}
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className={styles.detailsUnavailable}>
                        Detalles privados
                      </span>
                    )}
                  </article>
                ))}
              </div>
            )}
            {pages > 1 && (
              <nav
                className={styles.pagination}
                aria-label="Páginas de mis predicciones"
              >
                <button
                  disabled={page === 0}
                  onClick={() =>
                    setHistoryView((v) => ({ ...v, page: page - 1 }))
                  }
                >
                  Anterior
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  disabled={page === pages - 1}
                  onClick={() =>
                    setHistoryView((v) => ({ ...v, page: page + 1 }))
                  }
                >
                  Siguiente
                </button>
              </nav>
            )}
            {free && free.summary.total > free.tickets.length && (
              <p className={styles.muted}>
                Se muestran las últimas {free.tickets.length} predicciones. Tu
                rendimiento incluye todo el historial.
              </p>
            )}
          </section>
        </div>
      </div>
      {active && (
        <DashboardDialog
          titleId="forecast-dialog-title"
          onClose={close}
          wide
          dismissible={!busy}
        >
          <section
            className={styles.forecastModal}
            data-forecast-dialog={active.id}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>PRONÓSTICO CON PUNTOS</p>
                <h2 id="forecast-dialog-title">{active.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar pronóstico"
                disabled={!!busy}
                onClick={close}
              >
                <X size={20} />
              </button>
            </header>
            <div className="prediction-live-time">
              <span>
                {modeLabel(active.mode)} · {regionLabel(active.region)}
              </span>
              <span className={styles.countdown} role="timer">
                <Clock size={14} />
                {remaining
                  ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} para participar`
                  : "Predicciones cerradas"}
              </span>
            </div>
            <fieldset
              disabled={!!busy || !!registered || !remaining}
              className={`${styles.duel} ${styles.modalTeams}`}
            >
              <legend className={styles.srOnly}>Elige al equipo ganador</legend>
              {active.teams.map((team) => {
                const chosen = (registered ?? choices[active.id]) === team.side;
                return (
                  <label
                    key={team.side}
                    className={`${styles.teamChoice} ${styles.modalTeam}`}
                    data-side={team.side}
                    data-selected={chosen}
                  >
                    <input
                      type="radio"
                      name={`forecast-${active.id}`}
                      value={team.side}
                      checked={chosen}
                      onChange={() =>
                        setChoices((v) => ({ ...v, [active.id]: team.side }))
                      }
                    />
                    <span className={styles.modalTeamHeading}>
                      <span className={styles.teamSymbol}>
                        {team.side === "RADIANT" ? "R" : "D"}
                      </span>
                      <span className={styles.teamIdentity}>
                        <small>{team.side}</small>
                        <strong>{team.name}</strong>
                      </span>
                      <span className={styles.selectionMark}>
                        {chosen && <Check size={14} />}
                      </span>
                    </span>
                    <span
                      className={styles.modalRoster}
                      role="list"
                      aria-label={`Jugadores de ${team.side === "RADIANT" ? "Radiant" : "Dire"}`}
                    >
                      {team.players.map((p, i) => (
                        <span
                          key={i}
                          role="listitem"
                          className={styles.rosterRow}
                        >
                          <span
                            className={styles.rosterDot}
                            aria-hidden="true"
                          />
                          <span className={styles.rosterName}>
                            <PlayerDisplayName id={p.userId} name={p.name} />
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className={styles.visualOdds}>
                      <span>Cuota</span>
                      <strong>1,80</strong>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {registered ? (
              <div className={styles.registered} role="status">
                <ShieldCheck size={20} />
                <div>
                  Pronóstico registrado:{" "}
                  {registered === "RADIANT" ? "Radiant" : "Dire"}
                  <small>
                    Elección y cantidad bloqueadas.{" "}
                    {registeredTicket?.status === "VOID"
                      ? "Partida anulada. Los puntos utilizados se devolvieron."
                      : registeredTicket?.status === "WON"
                        ? registeredTicket.reward
                          ? `Acertado · ${formatPoints(registeredTicket.reward.amount)} puntos acreditados.`
                          : "Pronóstico anterior acertado."
                        : registeredTicket?.status === "LOST"
                          ? "No acertaste. No hay devolución de los puntos utilizados."
                          : "Esperando el resultado verificado por GC."}
                  </small>
                  {registeredTicket?.usesPoints && (
                    <small>
                      {formatPoints(registeredTicket.stakePoints)} puntos
                      utilizados · Retorno total si aciertas:{" "}
                      {formatPoints(registeredTicket.potentialReturn)} puntos.
                    </small>
                  )}
                </div>
              </div>
            ) : (
              <form
                className={styles.modalForm}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const side = choices[active.id];
                  if (
                    !side ||
                    !remaining ||
                    busy ||
                    amountError ||
                    amount === null
                  )
                    return;
                  if (await onSubmit(active.id, side, amount.toString()))
                    setConfirmed((v) => ({ ...v, [active.id]: side }));
                }}
              >
                <section
                  className={styles.simulation}
                  aria-labelledby="forecast-amount-title"
                >
                  <div className={styles.simulationHeader}>
                    <h3 id="forecast-amount-title">
                      Puntos para tu pronóstico
                    </h3>
                    <span>
                      <Diamond size={13} aria-hidden="true" />
                      Saldo disponible:{" "}
                      <b data-reference-balance>
                        {available === null
                          ? "Comprobando…"
                          : formatPoints(available)}
                      </b>
                    </span>
                  </div>
                  <div className={styles.simulationBody}>
                    <div>
                      <label htmlFor="forecast-points">
                        Cantidad de puntos
                      </label>
                      <div className={styles.amountControl}>
                        <button
                          type="button"
                          aria-label="Restar un punto"
                          disabled={!!busy || !remaining}
                          onClick={() =>
                            setAmount(
                              String(Math.max(1, Number(amountText || 1) - 1)),
                            )
                          }
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          id="forecast-points"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck={false}
                          value={amountText}
                          disabled={!!busy || !remaining}
                          aria-invalid={!!amountError}
                          aria-describedby="forecast-amount-feedback"
                          onKeyDown={(e) => {
                            if (
                              e.ctrlKey ||
                              e.metaKey ||
                              e.altKey ||
                              e.key.length !== 1 ||
                              /^\d$/.test(e.key)
                            )
                              return;
                            e.preventDefault();
                            setAmountInputError(
                              "Usa solo números enteros, sin letras, signos ni decimales.",
                            );
                          }}
                          onPaste={(e) => {
                            const value = e.clipboardData.getData("text");
                            if (!/^\d+$/.test(value)) {
                              e.preventDefault();
                              setAmountInputError(
                                "Pegado rechazado: utiliza solo dígitos sin separadores.",
                              );
                            }
                          }}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label="Sumar un punto"
                          disabled={!!busy || !remaining}
                          onClick={() =>
                            setAmount(
                              String(
                                Math.min(
                                  predictionPointsPolicy.maximum,
                                  Number(amountText || 0) + 1,
                                ),
                              ),
                            )
                          }
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={styles.simulationPreview}
                      aria-live="polite"
                    >
                      <span>
                        {amount === null ? "—" : formatPoints(amount)} × 1,80 ·
                        Retorno total si aciertas
                      </span>
                      <strong data-prediction-return>
                        {total === null ? "—" : `${formatPoints(total)} puntos`}
                      </strong>
                    </div>
                  </div>
                  <p
                    id="forecast-amount-feedback"
                    className={styles.amountFeedback}
                    data-warning={!!amountError}
                    role={amountError ? "alert" : undefined}
                  >
                    {amountError ||
                      "Se descontarán al confirmar. Los puntos son enteros: las fracciones del retorno se redondean hacia abajo."}
                  </p>
                </section>
                <p className={styles.reviewChoice}>
                  {!remaining
                    ? "Predicciones cerradas. No se admiten nuevos pronósticos."
                    : choices[active.id]
                      ? `Confirmarás ${choices[active.id] === "RADIANT" ? "Radiant" : "Dire"} con ${amount === null ? "—" : formatPoints(amount)} puntos. La elección y la cantidad serán definitivas.`
                      : "Elige un equipo y una cantidad de puntos para continuar."}
                </p>
                {error && (
                  <p className={styles.modalError} role="alert">
                    {error}
                  </p>
                )}
                <button
                  className={styles.confirmButton}
                  type="submit"
                  disabled={
                    !choices[active.id] ||
                    !remaining ||
                    !!busy ||
                    !!amountError ||
                    amount === null
                  }
                >
                  {busy === active.id
                    ? "Registrando…"
                    : `Confirmar y usar ${amount === null ? "—" : formatPoints(amount)} puntos`}
                  <Check size={15} />
                </button>
              </form>
            )}
            <p className={styles.pointsRule}>
              Cuota 1,80 · El retorno incluye los puntos utilizados. Si fallas,
              no hay devolución; si se anula, se devuelven. Puntos virtuales sin
              valor monetario.
            </p>
          </section>
        </DashboardDialog>
      )}
    </section>
  );
}
