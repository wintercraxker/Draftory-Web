"use client";
import { useEffect, useState } from "react";
export function useHomeStatistics() {
  const [stats, setStats] = useState<{
    activeRooms: number;
    connectedUsers: number;
    committedPoints: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/public/statistics", {
          signal: controller.signal,
        });
        if (!r.ok) throw Error();
        setStats(await r.json());
      } catch {
        if (!controller.signal.aborted) setStats(null);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return stats;
}
