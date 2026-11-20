"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { initializeSounds, playSound } from "@/lib/sounds/engine";
import type { NotificationFeed } from "@/lib/real/notifications-repository";
import { NotificationSoundTracker } from "@/lib/sounds/notifications";
let receipt: { viewer: string; tracker: NotificationSoundTracker } | null =
  null;
export function useNotifications(enabled: boolean, viewerId?: string) {
  const [feed, setFeed] = useState<NotificationFeed>({
      items: [],
      unreadCount: 0,
      serverNow: new Date().toISOString(),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const clanRevision = useRef<string | undefined>(undefined);
  const mmrNotice = useRef<string | undefined>(undefined);
  const heard = useRef<NotificationSoundTracker | null>(null);
  const reconnecting = useRef(false);
  useEffect(() => {
    initializeSounds();
    if (!enabled || !viewerId) {
      heard.current = null;
      receipt = null;
      return;
    }
    if (receipt?.viewer !== viewerId)
      receipt = { viewer: viewerId, tracker: new NotificationSoundTracker() };
    heard.current = receipt.tracker;
  }, [enabled, viewerId]);
  const version = useRef(0),
    active = useRef(true);
  const invalidate = useCallback(() => {
    version.current++;
  }, []);
  const refresh = useCallback(
    async (audible = true) => {
      if (!enabled || !viewerId) return;
      const v = ++version.current;
      try {
        const r = await fetch("/api/notifications", { cache: "no-store" });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (active.current && v === version.current) {
          const incoming = value as NotificationFeed;
          const review = incoming.items.find(
            (item) => item.type === "MMR_REVIEW",
          )?.id;
          if (mmrNotice.current !== undefined && mmrNotice.current !== review)
            window.dispatchEvent(new Event("draftory:profile-updated"));
          mmrNotice.current = review ?? "";
          if (
            clanRevision.current !== undefined &&
            clanRevision.current !== incoming.clanRevision
          )
            window.dispatchEvent(new Event("draftory:clans-updated"));
          clanRevision.current = incoming.clanRevision;
          heard.current ??= new NotificationSoundTracker();
          {
            const item = heard.current.observe(
              incoming,
              audible && !reconnecting.current,
            );
            reconnecting.current = false;
            const reward =
              item && ["ACHIEVEMENT", "LEVEL_UP", "MVP"].includes(item.type);
            if (item)
              void playSound(
                reward ? "reward" : "notification",
                reward
                  ? "rewards"
                  : ["ROOM", "MATCH_RESULT"].includes(item.type)
                    ? "rooms"
                    : "notifications",
                "notification:" + item.id,
              );
          }
          setFeed(value);
          setError("");
        }
      } catch {
        if (active.current && v === version.current) {
          reconnecting.current = true;
          setError("No se pudieron actualizar las notificaciones.");
        }
      }
    },
    [enabled, viewerId],
  );
  const mark = useCallback(
    async (id: string | null) => {
      if (!enabled) return;
      const v = ++version.current;
      setBusy(true);
      try {
        const r = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id === null ? { all: true } : { id }),
        });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (active.current && v === version.current) {
          heard.current?.observe(value, false);
          setFeed(value);
          setError("");
        }
      } catch {
        if (active.current) setError("No se pudo marcar como leída.");
      } finally {
        if (active.current) setBusy(false);
      }
    },
    [enabled],
  );
  useEffect(() => {
    active.current = true;
    if (!enabled) return;
    const update = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const catchUp = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const initialRead = Promise.resolve().then(() => {
      if (active.current) return refresh(true);
    });
    void initialRead
      .then(() => {
        if (!active.current) return null;
        return fetch("/api/achievements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      })
      .then(async (r) => {
        if (r?.ok && active.current) {
          const value = await r.json();
          window.dispatchEvent(new Event("draftory:profile-updated"));
          void refresh(false);
          window.dispatchEvent(
            new CustomEvent("draftory:wallet-updated", {
              detail: { pointsAwarded: value.pointsAwarded },
            }),
          );
        }
      })
      .catch(() => {});
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("draftory:notifications-updated", update);
    return () => {
      active.current = false;
      invalidate();
      clearInterval(timer);
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("draftory:notifications-updated", update);
    };
  }, [enabled, refresh, invalidate]);
  return { feed, busy, error, refresh, mark };
}
