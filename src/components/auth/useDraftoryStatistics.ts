"use client";
import { useEffect, useState } from "react";
import type { DraftoryStatistics } from "@/lib/real/statistics-repository";
export function useDraftoryStatistics(userId: string) {
  const [data, setData] = useState<DraftoryStatistics>(),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    let generation = 0;
    const read = async () => {
      const current = ++generation;
      try {
        const r = await fetch(
          "/api/draftory-stats?handle=" + encodeURIComponent(userId),
          { signal: c.signal, cache: "no-store" },
        );
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!c.signal.aborted && generation === current) {
          setData(v);
          setError("");
        }
      } catch (e) {
        if (!c.signal.aborted && generation === current)
          setError((e as Error).message);
      }
    };
    void read();
    window.addEventListener("focus", read);
    window.addEventListener("draftory:results-updated", read);
    window.addEventListener("draftory:wallet-updated", read);
    return () => {
      c.abort();
      window.removeEventListener("focus", read);
      window.removeEventListener("draftory:results-updated", read);
      window.removeEventListener("draftory:wallet-updated", read);
    };
  }, [userId]);
  return { data, error };
}
