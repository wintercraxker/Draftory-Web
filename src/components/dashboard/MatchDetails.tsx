import { formatMatchDate, type DashboardMatch } from "@/lib/dashboard-data";
import { MatchResultSummary } from "./MatchResultSummary";
import { MatchAnalyticsDetails } from "./MatchAnalyticsDetails";
import { RoomPublicIdentity } from "./RoomPublicIdentity";
import { MatchRecognition } from "./MatchRecognition";
import { MatchTeamRoster } from "./LiveMatchCard";
import { DashboardBadge } from "./DashboardUi";

export function ResultBadge({ result }: { result: DashboardMatch["result"] }) {
  return (
    <DashboardBadge
      tone={
        result === "Victoria"
          ? "win"
          : result === "Derrota"
            ? "loss"
            : "neutral"
      }
      className={`dashboard-match-result ${result === "Victoria" ? "dashboard-result-win" : result === "Derrota" ? "dashboard-result-loss" : ""}`}
    >
      {result}
    </DashboardBadge>
  );
}
export function MatchDetails({
  match,
  ownerId = "self",
  ownerName,
}: {
  match: DashboardMatch;
  ownerId?: string;
  ownerName?: string;
}) {
  const ownTeam =
    (match.playerId === ownerId ? match.playerTeam : undefined) ??
    (match.radiant?.players?.some((p) => p.id === ownerId)
      ? "radiant"
      : match.dire?.players?.some((p) => p.id === ownerId)
        ? "dire"
        : undefined);
  const winner =
    match.winningSide?.toLowerCase() ?? match.recognition?.winningTeam;
  const date = formatMatchDate(match.playedAt);
  return (
    <div>
      {match.analytics ? (
        <header className="battle-detail-title">
          <p className="dashboard-eyebrow">
            {match.statusLabel ?? "Partida Draftory"}
          </p>
          <h2 id="match-detail-title" className="dashboard-section-title">
            {match.name}
          </h2>
        </header>
      ) : (
        <header className="match-result-header">
          <p className="dashboard-eyebrow">
            {match.statusLabel ?? "Partida finalizada"}
          </p>
          <h2 id="match-detail-title" className="dashboard-section-title mt-2">
            {match.name}
          </h2>
          <div className="match-result-score">
            <div>
              <span>Radiant</span>
              {ownTeam === "radiant" && (
                <DashboardBadge tone="you">
                  {ownerName ? `Equipo de ${ownerName}` : "Tu equipo"}
                </DashboardBadge>
              )}
              <strong>{match.radiant?.score ?? "—"}</strong>
            </div>
            <span className="dashboard-match-vs">VS</span>
            <div>
              <span>Dire</span>
              {ownTeam === "dire" && (
                <DashboardBadge tone="you">
                  {ownerName ? `Equipo de ${ownerName}` : "Tu equipo"}
                </DashboardBadge>
              )}
              <strong>{match.dire?.score ?? "—"}</strong>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ResultBadge result={match.result} />
            {winner && (
              <span className="text-xs text-zinc-300">
                Victoria {winner === "radiant" ? "Radiant" : "Dire"}
              </span>
            )}
            {match.time && (
              <span className="text-xs text-zinc-500">
                Duración: {match.time}
              </span>
            )}
          </div>
          {match.radiant?.score === undefined && (
            <p className="mt-3 text-[10px] text-zinc-600">
              Marcador no disponible.
            </p>
          )}
        </header>
      )}
      <MatchResultSummary match={match} />
      {match.roomPublicId && (
        <div className="mt-4">
          <RoomPublicIdentity publicId={match.roomPublicId} />
        </div>
      )}
      {match.analytics ? (
        <MatchAnalyticsDetails match={match} />
      ) : match.radiant || match.dire ? (
        <div className="dashboard-match-teams mt-5">
          <MatchTeamRoster
            commends={match.recognition?.commends}
            ownerId={ownerId}
            ownerName={ownerName}
            detailed
            side="Radiant"
            team={match.radiant}
          />
          <MatchTeamRoster
            commends={match.recognition?.commends}
            ownerId={ownerId}
            ownerName={ownerName}
            detailed
            side="Dire"
            team={match.dire}
          />
        </div>
      ) : (
        <p className="mt-5 text-xs text-zinc-500">
          Los equipos y jugadores no están registrados en esta partida.
        </p>
      )}
      {match.recognition && <MatchRecognition match={match.recognition} />}
      <dl className="match-result-metadata">
        {[
          {
            label: "Cambio de ELO",
            value:
              match.eloChange === undefined
                ? undefined
                : `${match.eloChange > 0 ? "+" : ""}${match.eloChange} ELO`,
          },
          {
            label: "Puntos Draftory",
            value:
              match.pointsChange === undefined
                ? undefined
                : `+${match.pointsChange} puntos`,
          },
          {
            label: "Experiencia",
            value:
              match.xpChange === undefined
                ? undefined
                : `+${match.xpChange} XP`,
          },
          {
            label: "Match ID",
            value: match.analytics
              ? undefined
              : (match.tracking?.externalMatchId ?? undefined),
          },
          { label: "Modo", value: match.mode },
          { label: "Región", value: match.region },
          { label: "Fecha", value: date },
        ]
          .filter((item) => item.value !== undefined)
          .map((item) => (
            <div key={item.label}>
              <dt className="dashboard-label">{item.label}</dt>
              <dd className="mt-2 text-sm text-zinc-200">{item.value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
