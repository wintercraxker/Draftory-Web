"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Gamepad2, Star } from "lucide-react";
import {
  getMatchStats,
  toLiveMatch,
  type DashboardMatch,
} from "@/lib/dashboard-data";
import type { LobbyState } from "@/lib/rooms/engine";
import type { Room } from "@/lib/room-mock-data";
import type { Prediction } from "@/lib/progression/server";
import type { PredictionWindow } from "./useDraftoryAccount";
import {
  EmptyState,
  PageHeader,
  DashboardButton,
  DashboardSkeleton,
  LoadError,
} from "./DashboardUi";
import { LiveMatchCard, LiveMatchDetails } from "./LiveMatchCard";
import { MatchDetails } from "./MatchDetails";
import { MatchHistory } from "./MatchHistory";
import { visibleHistoryCard } from "@/lib/match-visibility";

import { MatchRecognition } from "./MatchRecognition";
import type { MatchCompletion } from "@/lib/rooms/recognition";
export { MatchDetails } from "./MatchDetails";
export type MatchesTab = "live" | "history" | "mine";
const tabs = [
  { id: "live", label: "En vivo" },
  { id: "history", label: "Finalizadas" },
  { id: "mine", label: "Mis partidas" },
] as const;
export function MatchesPanel({
  rooms,
  lobbies,
  matches,
  tab,
  onTab,
  onOpen,
  onRooms,
  rewarded,
  onSimulate,
  onMvp,
  onCloseMvp,
  mvpMatch,
  windows = [],
  predictions = [],
  now = 0,
  onPredict,
  onDemoLive,
  demoBusy,
  loading = false,
  error,
  onRetry,
  notice,
  records,
  statistics,
  ownerId = "self",
  demo = true,
}: {
  statistics?: { played: number; wins: number; winrate: number };
  records?: DashboardMatch[];
  ownerId?: string;
  demo?: boolean;
  rooms: Room[];
  lobbies: Record<string, LobbyState>;
  matches: DashboardMatch[];
  joined: string[];
  tab: MatchesTab;
  onTab: (tab: MatchesTab) => void;
  onOpen: (room: Room) => void;
  onRooms: () => void;
  rewarded: boolean;
  onSimulate: (won: boolean) => void;
  onMvp?: () => void;
  onPredictions?: () => void;
  onCloseMvp?: () => void;
  mvpMatch?: MatchCompletion;
  windows?: PredictionWindow[];
  predictions?: Prediction[];
  now?: number;
  onPredict?: (id: string) => void;
  onDemoLive?: () => void;
  demoBusy?: boolean;
  loading?: boolean;
  error?: string;
  notice?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const matchDetailNavigate = (id: string) =>
    router.push(`/partidas/${encodeURIComponent(id)}?from=${tab}`);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const { played, wins, winrate } = statistics ?? getMatchStats(matches);
  const liveRooms = rooms.filter((room) => room.status === "live");
  const windowFor = (room: Room) =>
    windows.find((window) => window.roomId === room.id);
  const ticketFor = (room: Room) =>
    predictions.find((ticket) => ticket.matchId === windowFor(room)?.id);
  const participant = (room: Room) => {
    const roster = windowFor(room) ?? lobbies[room.id];
    return (
      !!roster?.radiant.some((player) => player.id === ownerId) ||
      !!roster?.dire.some((player) => player.id === ownerId)
    );
  };
  const details = detailId
    ? liveRooms.find((room) => room.id === detailId)
    : undefined;
  if (details)
    return (
      <LiveMatchDetails
        match={toLiveMatch(details, windowFor(details) ?? lobbies[details.id])}
        participant={participant(details)}
        prediction={windowFor(details)}
        ticket={ticketFor(details)}
        now={now}
        onOpen={() => onOpen(details)}
        onRoom={() => onOpen(details)}
        onBack={() => setDetailId(null)}
        onPredict={() => {
          const window = windowFor(details);
          if (window) onPredict?.(window.id);
        }}
      />
    );
  const selectedRecord = records?.find((record) => record.id === detailId);
  if (selectedRecord)
    return (
      <section className="dashboard-enter">
        <DashboardButton variant="ghost" onClick={() => setDetailId(null)}>
          Volver a partidas
        </DashboardButton>
        <div className="dashboard-panel mt-4 p-5 sm:p-6">
          <MatchDetails match={selectedRecord} ownerId={ownerId} />
        </div>
      </section>
    );
  const shownRecords = records?.filter((record) =>
    tab === "mine"
      ? ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"].includes(record.status!)
      : record.status === "IN_PROGRESS" &&
        record.tracking?.activity === "CONFIRMED",
  );
  const realGrid = (
    <div className="dashboard-live-matches dashboard-browse-matches">
      {shownRecords?.slice(0, visibleCount).map((record) => (
        <LiveMatchCard
          summary
          key={record.id}
          match={{
            ...record,
            radiant: record.radiant ?? {},
            dire: record.dire ?? {},
            opponents: [
              record.radiant?.name ?? "Radiant",
              record.dire?.name ?? "Dire",
            ],
          }}
          participant={false}
          onOpen={() => matchDetailNavigate(record.id)}
          statusLabel={record.statusLabel}
        />
      ))}
      {!!shownRecords && shownRecords.length > visibleCount && (
        <DashboardButton onClick={() => setVisibleCount((n) => n + 10)}>
          Mostrar más partidas ({shownRecords.length - visibleCount})
        </DashboardButton>
      )}
      {!shownRecords?.length && (
        <EmptyState
          icon={Gamepad2}
          title={
            tab === "mine"
              ? "Todavía no tienes intentos de partida."
              : "No hay partidas en vivo."
          }
          description="Tus encuentros de Draftory aparecerán aquí."
          action={
            <DashboardButton onClick={onRooms}>
              Explorar salas
              <ArrowRight size={13} />
            </DashboardButton>
          }
        />
      )}
    </div>
  );
  const shown = tab === "mine" ? liveRooms.filter(participant) : liveRooms;
  const liveGrid = (
    <>
      <p className="dashboard-label mb-4">
        ● {shown.length}{" "}
        {shown.length === 1 ? "partida en vivo" : "partidas en vivo"}
      </p>
      <div className="dashboard-live-matches dashboard-browse-matches">
        {shown.slice(0, visibleCount).map((room) => (
          <LiveMatchCard
            summary
            key={room.id}
            match={toLiveMatch(room, windowFor(room) ?? lobbies[room.id])}
            participant={participant(room)}
            prediction={windowFor(room)}
            ticket={ticketFor(room)}
            now={now}
            onOpen={() => setDetailId(room.id)}
            onPredict={() => {
              const window = windowFor(room);
              if (window) onPredict?.(window.id);
            }}
          />
        ))}
        {shown.length > visibleCount && (
          <DashboardButton onClick={() => setVisibleCount((n) => n + 10)}>
            Mostrar más partidas ({shown.length - visibleCount})
          </DashboardButton>
        )}
        {!shown.length && (
          <EmptyState
            icon={Gamepad2}
            title={
              tab === "mine"
                ? "No tienes una partida activa."
                : "No hay partidas en vivo."
            }
            description="Cuando una sala comience aparecerá aquí."
            action={
              <DashboardButton variant="primary" onClick={onRooms}>
                Explorar salas
                <ArrowRight size={13} />
              </DashboardButton>
            }
          />
        )}
      </div>
    </>
  );
  return (
    <section className="dashboard-enter space-y-6">
      <PageHeader
        eyebrow="Partidas"
        title={
          tab === "live"
            ? "Seguimiento de partidas"
            : "Tu historial competitivo"
        }
        description="Encuentros en vivo y tu historial competitivo en Draftory."
        action={
          <dl className="dashboard-match-summary">
            {[
              { label: "Partidas", value: played },
              { label: "Victorias", value: wins },
              { label: "Winrate", value: `${Math.round(winrate)}%` },
            ].map((item) => (
              <div key={item.label}>
                <dt className="dashboard-label">{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        }
      />
      <div
        className="dashboard-tabs"
        role="tablist"
        aria-label="Vistas de partidas"
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`matches-tab-${item.id}`}
            role="tab"
            tabIndex={tab === item.id ? 0 : -1}
            aria-selected={tab === item.id}
            aria-controls={`matches-${item.id}`}
            onClick={() => {
              setDetailId(null);
              setVisibleCount(10);
              onTab(item.id);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                onTab(tabs[next].id);
                document
                  .getElementById(`matches-tab-${tabs[next].id}`)
                  ?.focus();
              }
            }}
          >
            {item.label}
            {item.id === "live" && (
              <span className="ml-2 text-[10px] text-zinc-500">
                {records
                  ? records.filter(
                      (record) =>
                        record.status === "IN_PROGRESS" &&
                        (!record.tracking ||
                          record.tracking.activity !== "ENDED"),
                    ).length
                  : liveRooms.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {error && <LoadError message={error} onRetry={onRetry} />}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-zinc-800 px-4 py-3 text-xs text-zinc-400"
        >
          {notice}
        </p>
      )}
      <div
        id={`matches-${tab}`}
        role="tabpanel"
        aria-labelledby={`matches-tab-${tab}`}
      >
        {loading ? (
          <DashboardSkeleton variant="matches" />
        ) : tab === "history" ? (
          <div className="dashboard-panel dashboard-match-history">
            <MatchHistory
              matches={records ? records.filter(visibleHistoryCard) : matches}
              ownerId={ownerId}
              filters
              now={now}
              onRooms={onRooms}
            />
          </div>
        ) : (
          <>
            {records ? realGrid : liveGrid}
            {tab === "mine" && (
              <div className="dashboard-panel dashboard-match-history mt-5">
                <h2 className="dashboard-section-title mb-4">Tu historial</h2>
                <MatchHistory
                  matches={
                    records ? records.filter(visibleHistoryCard) : matches
                  }
                  ownerId={ownerId}
                  now={now}
                  onRooms={onRooms}
                />
              </div>
            )}
          </>
        )}
      </div>
      {demo && (
        <div className="dashboard-match-demo-controls">
          <p className="dashboard-label">
            Herramientas demo · resultados simulados por el servidor
          </p>
          <div className="flex flex-wrap gap-2">
            {onDemoLive && (
              <DashboardButton busy={demoBusy} onClick={onDemoLive}>
                Crear partida demo en vivo
              </DashboardButton>
            )}
            {onMvp && (
              <DashboardButton onClick={onMvp}>
                <Star size={13} />
                Probar MVP
              </DashboardButton>
            )}
            {onCloseMvp && (
              <DashboardButton onClick={onCloseMvp}>
                Simular resultado MVP
              </DashboardButton>
            )}
            <DashboardButton
              disabled={rewarded}
              onClick={() => onSimulate(true)}
            >
              Simular victoria (+ELO / XP)
            </DashboardButton>
            <DashboardButton
              disabled={rewarded}
              onClick={() => onSimulate(false)}
            >
              Simular derrota (+XP / -ELO)
            </DashboardButton>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {windows
              .filter((window) => window.demo)
              .map((window) => (
                <DashboardButton
                  key={window.id}
                  variant="ghost"
                  onClick={() => onPredict?.(window.id)}
                >
                  Administrar demo · {window.name}
                </DashboardButton>
              ))}
          </div>
          <p className="text-[10px] text-zinc-500">
            La partida de prueba te deja como observador. Usa Probar MVP para
            obtener puntos antes de predecir.
          </p>
        </div>
      )}
      {mvpMatch?.finalized && <MatchRecognition match={mvpMatch} />}
    </section>
  );
}
