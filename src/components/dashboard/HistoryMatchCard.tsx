"use client";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { formatMatchDate, type DashboardMatch } from "@/lib/dashboard-data";
import { normalizeRoomMode } from "@/lib/rooms/lobby-options.mjs";
import { DashboardButton, DashboardBadge } from "./DashboardUi";
import { AvatarImage } from "./AvatarIdentity";
import { HeroPortrait } from "./MatchBattleDetails";

export function historyResult(match: DashboardMatch) {
  if (match.status === "CANCELLED")
    return match.attemptFailed ? "failed" : "cancelled";
  if (match.tracking?.result === "UNVERIFIED") return "unverified";
  if (match.tracking && match.tracking.result !== "VERIFIED") return "pending";
  return match.result === "Victoria" || match.result === "Derrota"
    ? match.result
    : "pending";
}
export function HistoryMatchCard({
  match,
  team,
  ownerName,
  onDetails,
}: {
  match: DashboardMatch;
  ownerName?: string;
  team?: "radiant" | "dire";
  onDetails: () => void;
}) {
  const state = historyResult(match),
    cancelled = state === "cancelled" || state === "failed";
  const verified = state === "Victoria" || state === "Derrota";
  const labels = {
    cancelled: "Intento cancelado",
    failed: "Intento fallido",
    pending: "Resultado pendiente",
    unverified: "Resultado no verificable",
    Victoria: "Victoria",
    Derrota: "Derrota",
  };
  const mvp =
    verified &&
    !!match.playerId &&
    (match.mvpUserId === match.playerId ||
      (match.recognition?.finalized === true &&
        match.recognition.mvpIds.includes(match.playerId)));
  const matchId =
    match.analytics?.externalMatchId ?? match.tracking?.externalMatchId;
  const hero = match.analytics?.players.find(
    (p) => p.userId === match.playerId,
  )?.heroId;
  const identity = [
    ...(match.radiant?.players ?? []),
    ...(match.dire?.players ?? []),
  ].find((p) => p.id === match.playerId);
  const catalog = match.heroCatalog ?? [];
  const rewards =
    verified && normalizeRoomMode(match.mode) !== "ONE_V_ONE_MID"
      ? [
          { value: match.eloChange, unit: "ELO" },
          { value: match.pointsChange, unit: "puntos" },
          { value: match.xpChange, unit: "XP" },
        ].filter((r) => typeof r.value === "number" && Number.isFinite(r.value))
      : [];
  if (cancelled)
    return (
      <article
        className="history-card history-attempt-row"
        data-result={match.result}
        data-state={state}
      >
        <div>
          <DashboardBadge tone="neutral">{labels[state]}</DashboardBadge>
          <strong>{match.name}</strong>
          <small>Sin resultado competitivo</small>
        </div>
        <div className="history-attempt-meta">
          <span>
            {normalizeRoomMode(match.mode) === "ONE_V_ONE_MID"
              ? "Solo Mid 1v1"
              : match.mode}
            {match.region ? ` · ${match.region}` : ""}
          </span>
          {match.playedAt && (
            <time dateTime={match.playedAt}>
              {formatMatchDate(match.playedAt)}
            </time>
          )}
          {matchId && <span>Match {matchId}</span>}
        </div>
        <DashboardButton variant="secondary" onClick={onDetails}>
          Ver detalles
          <ArrowRight size={14} />
        </DashboardButton>
      </article>
    );
  return (
    <article
      className="history-match-card history-card"
      data-result={match.result}
      data-state={state}
    >
      <header className="history-card-top">
        <div className="flex flex-wrap items-center gap-2">
          <DashboardBadge
            tone={
              state === "Victoria"
                ? "win"
                : state === "Derrota"
                  ? "loss"
                  : "neutral"
            }
          >
            {labels[state]}
          </DashboardBadge>
          {mvp && <DashboardBadge tone="neutral">MVP</DashboardBadge>}
        </div>
        {match.playedAt && (
          <time dateTime={match.playedAt}>
            {formatMatchDate(match.playedAt)}
          </time>
        )}
      </header>
      <div className="history-card-title">
        <strong className="flex items-center gap-2">
          {identity && (
            <AvatarImage
              id={identity.id}
              src={identity.avatar ?? undefined}
              alt={identity.name}
              size={24}
              className="size-6 shrink-0 rounded-full object-cover"
            />
          )}
          {match.name}
        </strong>
        <span>
          {normalizeRoomMode(match.mode) === "ONE_V_ONE_MID"
            ? "Solo Mid 1v1"
            : match.mode}
        </span>
      </div>
      {cancelled ? (
        <p className="history-card-cancelled">
          {state === "failed" ? "Intento fallido" : "Intento cancelado"} · Sin
          resultado competitivo
        </p>
      ) : (
        <div className="history-card-duel" aria-label="Radiant contra Dire">
          {(["radiant", "dire"] as const).map((side, i) => (
            <div
              key={side}
              data-own={team === side}
              data-winner={
                verified && match.winningSide?.toLowerCase() === side
              }
            >
              {i === 1 && (
                <span className="history-card-vs" aria-hidden>
                  vs
                </span>
              )}
              <strong>{side === "radiant" ? "RADIANT" : "DIRE"}</strong>
              <small>
                {team === side
                  ? ownerName
                    ? `Equipo de ${ownerName}`
                    : "Tu equipo"
                  : "Rival"}
                {verified && match.winningSide?.toLowerCase() === side
                  ? " · Ganador"
                  : ""}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="history-card-facts">
        {!cancelled && match.time && (
          <span>
            <Clock size={14} />
            {match.time}
          </span>
        )}
        {match.region && (
          <span>
            <MapPin size={14} />
            {match.region}
          </span>
        )}
        {matchId && <span className="history-card-id">Match {matchId}</span>}
        {!cancelled && hero && (
          <span className="history-card-hero">
            <HeroPortrait heroId={hero} catalog={catalog} />
            {catalog.find((h) => h.heroId === hero)?.name ?? `Héroe ${hero}`}
          </span>
        )}
      </div>
      <footer>
        <div className="history-rewards">
          {rewards.map((r) => (
            <span key={r.unit} data-negative={r.value! < 0}>
              {r.value! > 0 ? "+" : ""}
              {r.value} {r.unit}
            </span>
          ))}
        </div>
        <DashboardButton variant="secondary" onClick={onDetails}>
          Ver detalles
          <ArrowRight size={14} />
        </DashboardButton>
      </footer>
    </article>
  );
}
