"use client";
import { useEffect, useState } from "react";
import { Circle, Info } from "lucide-react";
export type BotCapacity = { available: boolean; operationsEnabled: boolean };
export function BotCapacityNotice({
  onAvailability,
}: { onAvailability?: (capacity: BotCapacity | null) => void } = {}) {
  const [status, setStatus] = useState<BotCapacity | null>(null);
  useEffect(() => {
    const c = new AbortController();
    let busy = false;
    const update = (value: BotCapacity | null) => {
      if (!c.signal.aborted) {
        setStatus(value);
        onAvailability?.(value);
      }
    };
    const read = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch("/api/bots/status", {
          signal: c.signal,
          cache: "no-store",
        });
        if (r.ok) {
          const d = await r.json();
          update({
            available: d.available === true,
            operationsEnabled: d.operationsEnabled === true,
          });
        } else update(null);
      } catch {
        update(null);
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [onAvailability]);
  const label = !status
    ? "Disponibilidad sin confirmar"
    : !status.operationsEnabled
      ? "Partidas en preparación"
      : status.available
        ? "Bots disponibles"
        : "En espera de un bot disponible";
  return (
    <div
      className="mb-3 flex items-center gap-2 text-xs text-zinc-400"
      role="status"
    >
      <Circle
        aria-hidden="true"
        size={7}
        className={
          status?.available
            ? "fill-green-400 text-green-400"
            : "fill-zinc-500 text-zinc-500"
        }
      />
      <span>{label}</span>
      <span
        tabIndex={0}
        title="Las salas y el chat siguen disponibles. Iniciar una partida requiere operaciones competitivas habilitadas y un bot con Steam/GC y salud reciente confirmados."
        aria-label="Las salas y el chat siguen disponibles. Iniciar partida requiere disponibilidad real."
        className="rounded focus-visible:outline-2 focus-visible:outline-violet-400"
      >
        <Info size={13} aria-hidden="true" />
      </span>
    </div>
  );
}
