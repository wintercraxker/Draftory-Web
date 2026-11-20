"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Gamepad2 } from "lucide-react";
import { formatMatchDate, type DashboardMatch } from "@/lib/dashboard-data";
import { EmptyState, DashboardButton } from "./DashboardUi";
import { HistoryMatchCard, historyResult } from "./HistoryMatchCard";
import { MatchDetails } from "./MatchDetails";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth/AuthProvider";
import { visibleHistoryCard } from "@/lib/match-visibility";

export function historyGroup(playedAt?: string, now = 0) {
  if (!formatMatchDate(playedAt)) return "";
  const date = new Date(playedAt!);
  const day = (value: Date) =>
    value.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  if (now && day(date) === day(new Date(now))) return "Hoy";
  if (now && day(date) === day(new Date(now - 86400000))) return "Ayer";
  return date.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
export function getMatchOwnerTeam(match: DashboardMatch, ownerId: string) {
  return (
    (match.playerId === ownerId ? match.playerTeam : undefined) ??
    (match.radiant?.players?.some((player) => player.id === ownerId)
      ? "radiant"
      : match.dire?.players?.some((player) => player.id === ownerId)
        ? "dire"
        : undefined)
  );
}
export function MatchHistory({
  matches,
  limit,
  ownerName,
  ownerId = "self",
  filters = false,
  onRooms,
}: {
  matches: DashboardMatch[];
  limit?: number;
  ownerName?: string;
  ownerId?: string;
  filters?: boolean;
  onRooms?: () => void;
  now?: number;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null),
    scrollBeforeDetail = useRef(0);
  const filtered = matches
    .filter(visibleHistoryCard)
    .filter(
      (match) =>
        filter === "all" ||
        historyResult(match) === filter ||
        (filter === "cancelled" && historyResult(match) === "failed") ||
        (filter === "pending" && historyResult(match) === "unverified"),
    )
    .sort((a, b) => {
      const aTime = formatMatchDate(a.playedAt)
        ? Date.parse(a.playedAt!)
        : -Infinity;
      const bTime = formatMatchDate(b.playedAt)
        ? Date.parse(b.playedAt!)
        : -Infinity;
      return aTime === bTime ? 0 : bTime - aTime;
    });
  const visible = limit ? filtered.slice(0, limit) : filtered;
  const detail = matches.find((match) => match.id === selected);
  const renderCard = (match: DashboardMatch) => (
    <HistoryMatchCard
      key={match.id}
      match={match}
      ownerName={ownerId !== user?.id ? ownerName : undefined}
      team={getMatchOwnerTeam(match, ownerId)}
      onDetails={() => {
        if (user?.id) {
          router.push(`/partidas/${encodeURIComponent(match.id)}?from=history`);
          return;
        }
        scrollBeforeDetail.current = window.scrollY;
        setSelected(match.id);
        requestAnimationFrame(() =>
          root.current?.scrollIntoView({ block: "start" }),
        );
      }}
    />
  );
  return (
    <div ref={root}>
      {detail ? (
        <section className="dashboard-enter history-detail-page">
          <DashboardButton
            variant="ghost"
            onClick={() => {
              setSelected(null);
              requestAnimationFrame(() =>
                window.scrollTo({ top: scrollBeforeDetail.current }),
              );
            }}
          >
            <ArrowLeft size={14} />
            Volver al historial
          </DashboardButton>
          <div className="dashboard-panel mt-4 p-5 sm:p-6">
            <MatchDetails
              match={detail}
              ownerId={ownerId}
              ownerName={ownerName}
            />
          </div>
        </section>
      ) : (
        <>
          {filters && (
            <>
              <h2 className="dashboard-section-title mb-4">
                {ownerName
                  ? `Historial de ${ownerName}`
                  : "Historial de partidas"}
              </h2>
              <div
                className="dashboard-tabs history-filters"
                aria-label="Filtrar historial"
              >
                {[
                  { id: "all", label: "Todas" },
                  { id: "Victoria", label: "Victorias" },
                  { id: "Derrota", label: "Derrotas" },
                ].map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="history-match-list" key={filter}>
            {visible.map(renderCard)}
          </div>
          {!visible.length && (
            <EmptyState
              compact
              icon={Gamepad2}
              title={
                matches.length
                  ? "No hay partidas con este resultado."
                  : ownerName
                    ? `${ownerName} todavía no tiene partidas registradas.`
                    : "Todavía no has jugado ninguna partida."
              }
              description={
                ownerName
                  ? "Los encuentros de este jugador aparecerán cuando complete una partida en Draftory."
                  : "Tu historial aparecerá aquí cuando completes tu primera partida."
              }
              action={
                onRooms && (
                  <DashboardButton variant="primary" onClick={onRooms}>
                    Buscar sala
                    <ArrowRight size={14} />
                  </DashboardButton>
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}
