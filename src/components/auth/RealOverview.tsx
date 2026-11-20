"use client";
import { useEffect, useState } from "react";
import type { RealProfile } from "@/lib/real/types";
import type { RealMatch } from "@/lib/real/match-repository";
import type { DashboardMatch } from "@/lib/dashboard-data";
import { Overview } from "../dashboard/Overview";
import { useDraftoryStatistics } from "./useDraftoryStatistics";
import { presentMatch } from "./RealMatches";
export function RealOverview({
  profile,
  onRooms,
}: {
  profile: RealProfile;
  onRooms: () => void;
}) {
  const { data, error } = useDraftoryStatistics(profile.id);
  const [matches, setMatches] = useState<DashboardMatch[]>([]),
    [historyError, setHistoryError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    let generation = 0;
    const read = () => {
      const current = ++generation;
      return fetch("/api/matches", { signal: c.signal, cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          if (!c.signal.aborted && current === generation)
            setMatches(
              v.records
                .filter((row: RealMatch) => row.result !== "Sin resultado")
                .map(presentMatch),
            );
        })
        .catch((e) => {
          if (!c.signal.aborted && current === generation)
            setHistoryError(e.message);
        });
    };
    void read();
    window.addEventListener("focus", read);
    window.addEventListener("draftory:results-updated", read);
    return () => {
      c.abort();
      window.removeEventListener("focus", read);
      window.removeEventListener("draftory:results-updated", read);
    };
  }, []);
  if (error || historyError)
    return (
      <p role="alert" className="dashboard-panel rounded-xl p-5">
        {error || historyError}
      </p>
    );
  if (!data)
    return (
      <p role="status" className="text-sm text-zinc-400">
        Cargando tu actividad…
      </p>
    );
  return (
    <Overview
      name={profile.name}
      elo={data.elo}
      xp={data.xp}
      matches={matches}
      onRooms={onRooms}
      realData={data}
      ownerId={profile.id}
    />
  );
}
