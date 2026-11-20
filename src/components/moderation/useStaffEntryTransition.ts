"use client";
import { useEffect, useRef, useState } from "react";

/** Presentation only: requests and authorization continue immediately. */
export function useStaffEntryTransition(ready: boolean, failed: boolean) {
  const started = useRef<number | null>(null);
  const [phase, setPhase] = useState<"waiting" | "leaving" | "done">("waiting");
  useEffect(() => {
    started.current ??= performance.now();
    if (phase === "done") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Failure is rendered immediately; settle the entry so a retry is not delayed.
    if (failed) timer = setTimeout(() => setPhase("done"), 0);
    else if (ready) {
      if (phase === "waiting")
        timer = setTimeout(
          () => setPhase("leaving"),
          Math.max(0, 2500 - (performance.now() - started.current)),
        );
      else
        timer = setTimeout(
          () => setPhase("done"),
          matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300,
        );
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ready, failed, phase]);
  return { visible: !failed && phase !== "done", exiting: phase === "leaving" };
}
