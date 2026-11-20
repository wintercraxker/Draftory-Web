"use client";
import { roomModeLabel, roomServerLabel } from "@/lib/rooms/lobby-options.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealMatch } from "@/lib/real/match-repository";
import type { DashboardMatch, MatchTeam } from "@/lib/dashboard-data";
import { presentMember } from "@/lib/real/presentation";
import { MatchesPanel, type MatchesTab } from "../dashboard/MatchesPanel";
import { useRouter, useSearchParams } from "next/navigation";

export function presentMatch(row: RealMatch): DashboardMatch {
  const labels = {
    QUEUED: "En preparación",
    LOBBY_SENT: "Esperando jugadores",
    IN_PROGRESS: "En vivo",
    COMPLETED: "Finalizada",
    CANCELLED: "Cancelada",
  };
  const team = (side: "RADIANT" | "DIRE"): MatchTeam | undefined => {
    const record = row.teams.find((t) => t.side === side);
    return record
      ? {
          name: record.name ?? undefined,
          score: record.score ?? undefined,
          playerCount: record.players.length,
          captainId: record.players.find((p) => p.isCaptain)?.userId,
          players: record.players.map((p) =>
            presentMember({ ...p, team: side }),
          ),
        }
      : undefined;
  };
  return {
    roomId: row.roomId,
    tracking: row.tracking,
    historyVisible: row.historyVisible,
    liveStartedAt: row.liveStartedAt,
    serverNow: row.serverNow,
    analytics: row.analytics,
    heroCatalog: row.heroCatalog,
    mvpUserId: row.mvpUserId,
    roomPublicId: row.roomPublicId,
    winningSide: row.winningSide,
    id: row.id,
    name: row.name,
    mode: roomModeLabel(row.mode),
    verifiedMode: row.verifiedMode,
    region: roomServerLabel(row.region),
    host: row.host,
    status: row.status,
    attemptFailed: row.attemptFailed,
    statusLabel: `${row.status === "COMPLETED" && row.tracking.result !== "VERIFIED" ? "Resultado pendiente de verificar" : (row.tracking.label ?? labels[row.status])} · Intento ${row.attemptNumber}`,
    result: row.result as DashboardMatch["result"],
    playerId: row.playerId,
    playerTeam: row.playerTeam,
    playedAt: row.finishedAt ?? row.startedAt ?? row.createdAt,
    time:
      row.durationSeconds == null
        ? undefined
        : `${Math.floor(row.durationSeconds / 60)}:${String(row.durationSeconds % 60).padStart(2, "0")}`,
    eloChange: row.eloChange,
    eloBefore: row.eloBefore,
    eloAfter: row.eloAfter,
    xpChange: row.xpChange,
    pointsChange: row.pointsChange,
    radiant: team("RADIANT"),
    dire: team("DIRE"),
  };
}
export function RealMatches({
  userId,
  onRooms,
}: {
  userId: string;
  onRooms: () => void;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const [records, setRecords] = useState<DashboardMatch[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<MatchesTab>(
      ["mine", "live", "history"].includes(query.get("tab") ?? "")
        ? (query.get("tab") as MatchesTab)
        : "mine",
    );
  const [statistics, setStatistics] = useState({
    played: 0,
    wins: 0,
    winrate: 0,
  });
  const generation = useRef(0);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    try {
      const response = await fetch("/api/matches", {
        cache: "no-store",
        signal,
      });
      const rows = await response.json();
      if (!response.ok) throw new Error(rows.error);
      if (!signal?.aborted && current === generation.current) {
        setRecords(rows.records.map(presentMatch));
        setStatistics(rows.statistics);
        setLoaded(true);
        setError("");
      }
    } catch (reason) {
      if (!signal?.aborted && current === generation.current) {
        setError((reason as Error).message);
        setLoaded(true);
      }
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.resolve().then(() => {
      if (!abort.signal.aborted) return reload(abort.signal);
    });
    const events = new EventSource("/api/rooms/events");
    let previous = "";
    events.onmessage = (event) => {
      if (event.data !== previous) {
        previous = event.data;
        void reload(abort.signal);
      }
    };
    const identity = () => {
      void reload(abort.signal);
    };
    window.addEventListener("draftory:identity-updated", identity);
    window.addEventListener("draftory:results-updated", identity);
    const refresh = window.setInterval(identity, 30000);
    return () => {
      window.clearInterval(refresh);
      abort.abort();
      events.close();
      window.removeEventListener("draftory:identity-updated", identity);
      window.removeEventListener("draftory:results-updated", identity);
    };
  }, [reload]);
  return (
    <MatchesPanel
      rooms={[]}
      lobbies={{}}
      matches={records.filter(
        (m) => m.status === "COMPLETED" || m.tracking?.activity === "ENDED",
      )}
      records={records}
      statistics={statistics}
      ownerId={userId}
      joined={[]}
      tab={tab}
      onTab={(next) => {
        setTab(next);
        router.replace(`/partidas?tab=${next}`, { scroll: false });
      }}
      onOpen={onRooms}
      onRooms={onRooms}
      rewarded={false}
      onSimulate={() => {}}
      demo={false}
      loading={!loaded}
      error={error}
      onRetry={() => void reload()}
    />
  );
}
