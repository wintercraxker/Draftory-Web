"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealPredictions as Data } from "@/lib/real/predictions-repository";
import { PredictionsPanel } from "../dashboard/PredictionsPanel";
import { useAuth } from "./AuthProvider";
export function RealPredictions() {
  const { wallet } = useAuth();
  const [data, setData] = useState<Data>(),
    [error, setError] = useState(""),
    [submitError, setSubmitError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [elapsed, setElapsed] = useState(0);
  const generation = useRef(0),
    saving = useRef(false),
    anchor = useRef(0);
  const read = useCallback(async (sync = false, signal?: AbortSignal) => {
    const current = ++generation.current;
    try {
      if (sync) {
        const s = await fetch("/api/predictions/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        });
        if (!s.ok) {
          const e = await s.json();
          throw Error(e.error);
        }
        window.dispatchEvent(new Event("draftory:wallet-updated"));
      }
      const r = await fetch("/api/predictions", { cache: "no-store", signal }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      if (!signal?.aborted && current === generation.current) {
        anchor.current = performance.now();
        setElapsed(0);
        setData(v);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted && current === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar los pronósticos.",
        );
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void Promise.resolve().then(() => {
      if (!c.signal.aborted) return read(true, c.signal);
    });
    const refresh = () => {
      if (!document.hidden && !saving.current) void read(true, c.signal);
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [read]);
  useEffect(() => {
    if (!data?.available.length) return;
    const timer = setInterval(
      () => setElapsed(performance.now() - anchor.current),
      1000,
    );
    return () => clearInterval(timer);
  }, [data]);
  const submit = async (
    matchId: string,
    team: "RADIANT" | "DIRE",
    points: string,
  ) => {
    if (saving.current) return false;
    saving.current = true;
    generation.current++;
    setBusy(matchId);
    setSubmitError("");
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, team, points }),
        }),
        v = await r.json();
      if (!r.ok) throw Error(v.error);
      setMessage(
        v.replayed
          ? "Este pronóstico ya estaba registrado. No se han descontado puntos otra vez."
          : "Pronóstico registrado y puntos descontados. Esperando resultado verificado.",
      );
      window.dispatchEvent(new Event("draftory:wallet-updated"));
      await read();
      return true;
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "No se pudo registrar el pronóstico.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };
  return (
    <PredictionsPanel
      free={data}
      balance={wallet?.balance}
      error={submitError || error}
      message={message}
      loading={!data && !error}
      busy={busy}
      now={data ? Date.parse(data.serverNow) + elapsed : 0}
      onRetry={() => void read(true)}
      onSubmit={submit}
    />
  );
}
