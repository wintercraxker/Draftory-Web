"use client";
import { useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/competitive";
import type { Room } from "@/lib/room-mock-data";
import type { PlayerProfileData } from "@/lib/player-profiles";
import {
  pointsConfig,
  achievementDefinitions,
  type Achievement,
  type PointsEntry,
} from "@/lib/progression/config";
import type { Prediction } from "@/lib/progression/server";
import type { OddsQuote } from "@/lib/progression/odds";
export type AccountData = {
  points: number;
  entries: PointsEntry[];
  achievements: Achievement[];
  predictions: Prediction[];
};
export type PredictionWindow = {
  id: string;
  roomId: string;
  name: string;
  radiant: Player[];
  dire: Player[];
  captains?: { radiant: string; dire: string } | null;
  startedAt: number;
  closesAt: number;
  quote: OddsQuote;
  demo?: boolean;
};
export function useServerClock(serverNow: number) {
  const [clock, setClock] = useState({ stamp: serverNow, now: serverNow });
  useEffect(() => {
    if (!serverNow) return;
    const origin = performance.now();
    const timer = setInterval(
      () =>
        setClock({
          stamp: serverNow,
          now: serverNow + performance.now() - origin,
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [serverNow]);
  return clock.stamp === serverNow ? clock.now : serverNow;
}
export function predictionTime(closesAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((closesAt - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function useDraftoryAccount(
  onRooms: (rooms: Room[], ownedRoom: Room | null, serverNow: number) => void,
  onProfile?: (profile: PlayerProfileData) => void,
  enabled = true,
) {
  const [token, setToken] = useState("");
  const [data, setData] = useState<AccountData>({
    points: pointsConfig.initial,
    entries: [],
    achievements: achievementDefinitions.map((value) => ({
      ...value,
      progress: 0,
    })),
    predictions: [],
  });
  const [windows, setWindows] = useState<PredictionWindow[]>([]),
    [serverNow, setServerNow] = useState(0),
    [unlock, setUnlock] = useState<Achievement | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const seen = useRef<Set<string> | null>(null),
    callback = useRef(onRooms);
  const profileCallback = useRef(onProfile);
  useEffect(() => {
    profileCallback.current = onProfile;
  }, [onProfile]);
  useEffect(() => {
    callback.current = onRooms;
  }, [onRooms]);
  const accept = (next: AccountData) => {
    const ids = new Set(
      next.achievements
        .filter((value) => value.unlockedAt !== undefined)
        .map((value) => value.id),
    );
    if (seen.current) {
      const fresh = next.achievements.find(
        (value) => ids.has(value.id) && !seen.current!.has(value.id),
      );
      if (fresh) setUnlock(fresh);
    }
    seen.current = ids;
    setData(next);
  };
  const acceptRef = useRef(accept);
  useEffect(() => {
    acceptRef.current = accept;
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let saved = "";
    try {
      saved = localStorage.getItem("draftory-demo-account") ?? "";
    } catch {}
    fetch("/api/demo/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: saved }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar tu cuenta.");
        const value = await response.json();
        if (controller.signal.aborted) return;
        setToken(value.token);
        acceptRef.current(value.account);
        profileCallback.current?.(value.player);
        try {
          localStorage.setItem("draftory-demo-account", value.token);
        } catch {}
        setLoading(false);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError("No se pudo cargar tu cuenta.");
        }
      });
    return () => controller.abort();
  }, [retry, enabled]);
  useEffect(() => {
    if (!enabled || !token) return;
    const controller = new AbortController();
    let inFlight: Promise<void> | undefined;
    const poll = (): Promise<void> => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        try {
          const headers = { Authorization: `Bearer ${token}` };
          const [accountResponse, roomsResponse] = await Promise.all([
            fetch("/api/demo/account", {
              headers,
              signal: controller.signal,
              cache: "no-store",
            }),
            fetch("/api/demo/lobbies", {
              headers,
              signal: controller.signal,
              cache: "no-store",
            }),
          ]);
          if (controller.signal.aborted) return;
          if (!accountResponse.ok)
            throw new Error("No se pudo cargar tu cuenta.");
          acceptRef.current(await accountResponse.json());
          if (roomsResponse.ok) {
            const value = await roomsResponse.json();
            setWindows(value.windows);
            setServerNow(value.serverNow);
            callback.current(
              value.rooms,
              value.ownedRoom ?? null,
              value.serverNow,
            );
            setError("");
          } else setError("No se pudieron cargar las partidas y predicciones.");
        } catch {
          if (!controller.signal.aborted)
            setError("No se pudieron cargar las partidas y predicciones.");
        }
      })().finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    // Mutations wait for any older read, then fetch their accepted state.
    refreshRef.current = async () => {
      await inFlight;
      if (!controller.signal.aborted) await poll();
    };
    return () => {
      controller.abort();
      clearInterval(timer);
      refreshRef.current = async () => {};
    };
  }, [token, retry, enabled]);
  useEffect(() => {
    if (!unlock) return;
    const timer = setTimeout(() => setUnlock(null), 4500);
    return () => clearTimeout(timer);
  }, [unlock]);
  return {
    token,
    data,
    windows,
    serverNow,
    unlock,
    accept,
    loading,
    error,
    refresh: () => refreshRef.current(),
    retry: () => {
      setLoading(true);
      setRetry((value) => value + 1);
    },
    dismissUnlock: () => setUnlock(null),
    saveAvatar: async (avatar: string) => {
      const response = await fetch("/api/demo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "avatar", token, avatar }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      profileCallback.current?.(value.player);
      return value.player as PlayerProfileData;
    },
    saveProfile: async (profile: PlayerProfileData) => {
      const response = await fetch("/api/demo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "profile", token, profile }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      return value.player as PlayerProfileData;
    },
  };
}
