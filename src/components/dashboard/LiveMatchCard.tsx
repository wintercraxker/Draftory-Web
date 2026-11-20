"use client";
import Image from "next/image";
import { RoleBadge } from "./DotaRoles";
import { getRoomRole } from "@/lib/dota-roles";
import { PlayerDotaMedal } from "./PlayerDotaMedal";
import { CurrentUserBadge, PlayerAvatar, PlayerName } from "./PlayerIdentity";
import { ArrowRight, Clock, Lock, Check, ArrowLeft } from "lucide-react";
import {
  getTeamAverages,
  type LiveMatch,
  type MatchTeam,
} from "@/lib/dashboard-data";
import type { Prediction } from "@/lib/progression/server";
import { DashboardCard, DashboardBadge, DashboardButton } from "./DashboardUi";
import { predictionTime, type PredictionWindow } from "./useDraftoryAccount";
import { LiveMatchClock } from "./LiveMatchClock";
import { ChatStaffLabel } from "../moderation/ChatStaffLabel";

export function matchElapsed(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function MatchTeamRoster({
  team,
  side,
  detailed = false,
  compact = false,
  ownerId = "self",
  ownerName,
  commends,
  analytics,
  heroCatalog,
}: {
  team?: MatchTeam;
  side: "Radiant" | "Dire";
  detailed?: boolean;
  compact?: boolean;
  ownerId?: string;
  ownerName?: string;
  analytics?: LiveMatch["analytics"];
  heroCatalog?: LiveMatch["heroCatalog"];
  commends?: { from: string; to: string }[];
}) {
  const playerCount = team?.players?.length ?? team?.playerCount;
  const averages = getTeamAverages(team?.players);
  const mmrAverage = team?.mmrAverage ?? averages.mmrAverage,
    eloAverage = team?.eloAverage ?? averages.eloAverage;
  return (
    <section className="dashboard-match-team" aria-label={side}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="dashboard-label">{side}</h3>
        {playerCount !== undefined && (
          <span className="text-[11px] text-zinc-500">
            {playerCount} jugadores
          </span>
        )}
      </div>
      {team?.name && (
        <p className="mt-2 break-words text-sm font-semibold">{team.name}</p>
      )}
      {!compact && mmrAverage !== undefined && (
        <p className="mt-2 text-xs tabular-nums text-zinc-400">
          {mmrAverage.toLocaleString("en-US")}{" "}
          <span className="text-[10px] text-zinc-500">MMR promedio</span>
        </p>
      )}
      {eloAverage !== undefined && (
        <p className="mt-1 text-xs text-zinc-400">
          {eloAverage.toLocaleString("en-US")} ELO promedio
        </p>
      )}
      {detailed && team?.score !== undefined && (
        <p className="mt-2 text-xs text-zinc-400">Marcador: {team.score}</p>
      )}
      {detailed &&
        (team?.players?.length ? (
          <ul className={compact ? "live-player-list" : "mt-4 space-y-3"}>
            {team.players.map((player) => (
              <li
                key={player.id}
                className={
                  compact ? "live-player-row" : "flex items-center gap-2"
                }
              >
                <span className="shrink-0">
                  {(() => {
                    const hero = heroCatalog?.find(
                      (h) =>
                        h.heroId ===
                        analytics?.players.find((a) => a.userId === player.id)
                          ?.heroId,
                    );
                    return hero ? (
                      <Image
                        src={hero.image}
                        alt={hero.name}
                        width={40}
                        height={24}
                        unoptimized
                        className="rounded"
                      />
                    ) : !compact ? (
                      <span
                        aria-label="Héroe no disponible"
                        className="inline-block h-6 w-10 rounded bg-zinc-800"
                      />
                    ) : null;
                  })()}
                </span>
                <PlayerAvatar
                  player={player}
                  size={compact ? 36 : 28}
                  className="rounded-lg"
                />
                <div className="min-w-0 live-player-identity">
                  {player.staffRole && (
                    <ChatStaffLabel role={player.staffRole} />
                  )}
                  <PlayerName
                    showLevel={false}
                    player={player}
                    className={
                      compact ? "live-player-name" : "text-xs break-words"
                    }
                  />
                  <PlayerDotaMedal player={player} />
                  {!compact &&
                    player.id === ownerId &&
                    (ownerName ? (
                      <DashboardBadge tone="you" className="ml-2">
                        {ownerName}
                      </DashboardBadge>
                    ) : (
                      <CurrentUserBadge className="ml-1" />
                    ))}
                  {!compact && team.captainId === player.id && (
                    <DashboardBadge tone="captain" className="ml-2">
                      Capitán
                    </DashboardBadge>
                  )}
                  <RoleBadge role={getRoomRole(player)} label={false} />
                  <p className="text-[10px] text-zinc-500">
                    {player.mmrAvailable !== false &&
                      Number.isFinite(player.mmr) && (
                        <span title="MMR operativo guardado para este intento">
                          {player.mmr.toLocaleString("en-US")} MMR ·{" "}
                        </span>
                      )}
                    {Number.isFinite(player.elo)
                      ? player.elo.toLocaleString("en-US")
                      : "\u2014"}{" "}
                    ELO
                  </p>
                  {!!commends?.some((vote) => vote.to === player.id) && (
                    <p className="mt-1 text-[10px] text-violet-200/70">
                      {commends.filter((vote) => vote.to === player.id).length}{" "}
                      Commends
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Integrantes no registrados en esta vista.
          </p>
        ))}
    </section>
  );
}
type LiveProps = {
  actionLabel?: string;
  summary?: boolean;
  match: LiveMatch;
  participant: boolean;
  onOpen: () => void;
  prediction?: PredictionWindow;
  now?: number;
  onPredict?: () => void;
  ticket?: Prediction;
  statusLabel?: string;
};
export function LiveMatchCard({
  actionLabel,
  match,
  participant,
  onOpen,
  prediction,
  now = 0,
  onPredict,
  ticket,
  statusLabel,
  summary = false,
}: LiveProps) {
  const open =
    prediction && now >= prediction.startedAt && now < prediction.closesAt;
  const confirmedLive = match.status
    ? match.tracking?.activity === "CONFIRMED"
    : !statusLabel;
  return (
    <DashboardCard
      variant="live"
      className={`dashboard-live-match compact-live-match${summary ? " match-summary-card" : ""}`}
    >
      <header className="flex justify-between items-center gap-2">
        <span
          className={`dashboard-room-status ${confirmedLive ? "dashboard-status-live" : "text-zinc-400"}`}
        >
          {confirmedLive && (
            <span className="dashboard-live-dot size-1.5 rounded-full bg-current" />
          )}
          {statusLabel ??
            match.tracking?.label ??
            (match.status ? "Verificando inicio" : "EN VIVO")}
        </span>
        {confirmedLive && match.liveStartedAt && match.serverNow ? (
          <LiveMatchClock
            startedAt={match.liveStartedAt}
            serverNow={match.serverNow}
          />
        ) : confirmedLive &&
          match.status === "IN_PROGRESS" &&
          !match.liveStartedAt ? (
          <span className="text-[11px] text-zinc-500">
            Duración no disponible
          </span>
        ) : (
          prediction &&
          !match.status && (
            <span className="match-elapsed">
              <Clock size={12} />
              {matchElapsed(prediction.startedAt, now)}
            </span>
          )
        )}
      </header>
      {match.opponents && <p className="dashboard-label mt-3">{match.name}</p>}
      <div className="compact-matchup">
        {match.opponents ? (
          <>
            <h2 title={match.opponents[0]}>{match.opponents[0]}</h2>
            <span>VS</span>
            <h2 title={match.opponents[1]}>{match.opponents[1]}</h2>
          </>
        ) : (
          <h2 className="col-span-full">{match.name}</h2>
        )}
      </div>
      <div className="dashboard-match-teams">
        <MatchTeamRoster
          compact
          detailed={!summary && !!match.radiant.players}
          analytics={match.analytics}
          heroCatalog={match.heroCatalog}
          side="Radiant"
          team={match.radiant}
        />
        <MatchTeamRoster
          compact
          detailed={!summary && !!match.dire.players}
          analytics={match.analytics}
          heroCatalog={match.heroCatalog}
          side="Dire"
          team={match.dire}
        />
      </div>
      <p className="match-mode-region">
        {match.mode}
        {match.region && ` · ${match.region}`}
      </p>
      {prediction && (
        <div className="compact-prediction-state">
          {ticket ? (
            <>
              <p className="dashboard-label">Tu predicción</p>
              <strong>
                {ticket.team.toUpperCase()} · {ticket.amount} pts @{" "}
                {ticket.odds.toFixed(2)}
              </strong>
              <p>
                Potencial: {Math.floor(ticket.amount * ticket.odds)} pts ·
                Esperando resultado…
              </p>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-1.5">
                {open ? <Clock size={12} /> : <Lock size={12} />}
                {open ? "Predicciones abiertas" : "Predicciones cerradas"}
              </p>
              {open && (
                <p>
                  Cierran en{" "}
                  <strong>{predictionTime(prediction.closesAt, now)}</strong>
                </p>
              )}
            </>
          )}
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <DashboardButton variant="secondary" onClick={onOpen}>
          {actionLabel ?? (participant ? "Volver a partida" : "Ver partida")}
          <ArrowRight size={12} />
        </DashboardButton>
        {ticket ? (
          <DashboardButton
            variant="ghost"
            className="prediction-registered"
            onClick={onPredict}
          >
            <Check size={12} />
            Predicción registrada
          </DashboardButton>
        ) : open && onPredict && !participant ? (
          <DashboardButton variant="primary" onClick={onPredict}>
            Predecir
          </DashboardButton>
        ) : null}
      </footer>
    </DashboardCard>
  );
}
export function LiveMatchDetails({
  match,
  prediction,
  now,
  ticket,
  onBack,
  onPredict,
  onRoom,
  participant,
}: LiveProps & { now: number; onBack: () => void; onRoom?: () => void }) {
  return (
    <section className="live-match-detail dashboard-enter">
      <DashboardButton variant="ghost" onClick={onBack}>
        <ArrowLeft size={13} />
        Volver a partidas
      </DashboardButton>
      <header className="mt-5 flex flex-wrap justify-between gap-4">
        <div>
          <p className="dashboard-eyebrow">
            {match.tracking?.label ?? "Seguimiento de partida"}
          </p>
          <h1 className="dashboard-page-title mt-2">{match.name}</h1>
          <p className="mt-2 text-xs text-zinc-500">
            {match.mode} · {match.region}
          </p>
        </div>
        <span className="match-elapsed">
          <span
            className={
              match.tracking?.activity === "CONFIRMED"
                ? "dashboard-status-live"
                : "text-zinc-400"
            }
          >
            {match.tracking?.label ?? "Verificando inicio"}
          </span>
          {prediction && matchElapsed(prediction.startedAt, now)}
        </span>
      </header>
      <div className="dashboard-match-teams mt-6">
        <MatchTeamRoster detailed side="Radiant" team={match.radiant} />
        <MatchTeamRoster detailed side="Dire" team={match.dire} />
      </div>
      <div className="dashboard-panel mt-5 p-5">
        <h2 className="dashboard-section-title">Predicciones</h2>
        {ticket ? (
          <p className="mt-3 text-xs text-zinc-300">
            {ticket.team.toUpperCase()} · {ticket.amount} pts @{" "}
            {ticket.odds.toFixed(2)} · Esperando resultado
          </p>
        ) : prediction ? (
          <>
            <p className="mt-3 text-xs text-zinc-400">
              {now < prediction.closesAt
                ? `Abiertas · ${predictionTime(prediction.closesAt, now)} restantes`
                : "Predicciones cerradas"}
            </p>
            {participant ? (
              <p className="mt-3 text-xs text-zinc-500">
                No puedes predecir una partida en la que participas.
              </p>
            ) : (
              now < prediction.closesAt && (
                <DashboardButton
                  className="mt-4"
                  variant="primary"
                  onClick={onPredict}
                >
                  Predecir
                </DashboardButton>
              )
            )}
          </>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Predicciones no disponibles para esta partida.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Estado del lobby: {match.tracking?.label ?? "verificando inicio"}
          {match.host && ` · Creada por ${match.host}`}
        </p>
        {participant && onRoom && (
          <DashboardButton onClick={onRoom}>
            Abrir sala
            <ArrowRight size={13} />
          </DashboardButton>
        )}
      </div>
    </section>
  );
}
