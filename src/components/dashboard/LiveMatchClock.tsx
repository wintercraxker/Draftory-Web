"use client";
import { useMemo, useSyncExternalStore } from "react";
import { elapsedMatchTime } from "@/lib/live-match-time";

// One timer for every visible live card; no HTTP polling. Monotonic elapsed time
// follows the PostgreSQL reference even if the browser wall clock is incorrect.
let mono = 0,
  timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function tick() {
  if (document.visibilityState !== "hidden") {
    mono = performance.now();
    for (const fn of listeners) fn();
  }
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    tick();
    timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", tick);
    }
  };
}
function referenceClock(serverNow: string) {
  const server = Date.parse(serverNow);
  let anchor: number | null = null;
  return {
    subscribe: (fn: () => void) => {
      anchor = performance.now();
      return subscribe(fn);
    },
    snapshot: () =>
      anchor === null ? server : server + Math.max(0, mono - anchor),
    serverSnapshot: () => server,
  };
}
export function LiveMatchClock({
  startedAt,
  serverNow,
}: {
  startedAt: string;
  serverNow: string;
}) {
  const source = useMemo(() => referenceClock(serverNow), [serverNow]);
  const now = useSyncExternalStore(
    source.subscribe,
    source.snapshot,
    source.serverSnapshot,
  );
  return (
    <time
      className="match-elapsed tabular-nums"
      dateTime={startedAt}
      aria-label="Tiempo desde el inicio confirmado"
      data-live-clock
    >
      {elapsedMatchTime(Date.parse(startedAt), now)}
    </time>
  );
}
