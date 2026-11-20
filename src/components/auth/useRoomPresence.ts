"use client";
import { useEffect } from "react";
export function useRoomPresence(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    // New per mounted browser document; duplicated tabs must not share a lease.
    const connectionId = crypto.randomUUID(),
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      busy = false,
      enabled = true;
    const beat = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      clearTimeout(timer);
      let delay = 15000;
      try {
        const response = await fetch("/api/rooms/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId }),
          signal: controller.signal,
        });
        if (response.ok) {
          const value = await response.json();
          enabled = value.enabled;
          delay = value.heartbeatMs ?? delay;
        } else if (response.status === 401 || response.status === 403)
          enabled = false;
      } catch {
        /* Expiring server lease handles network loss. No optimistic leave. */
      } finally {
        busy = false;
        if (enabled && !controller.signal.aborted)
          timer = setTimeout(() => void beat(), delay);
      }
    };
    const resume = () => {
      enabled = true;
      void beat();
    };
    const hide = () => {
      navigator.sendBeacon?.(
        "/api/rooms/presence",
        new Blob([JSON.stringify({ connectionId, release: true })], {
          type: "application/json",
        }),
      );
    };
    void beat();
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    window.addEventListener("draftory:room-membership-updated", resume);
    window.addEventListener("pagehide", hide);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("draftory:room-membership-updated", resume);
      window.removeEventListener("pagehide", hide);
    };
  }, [userId]);
}
