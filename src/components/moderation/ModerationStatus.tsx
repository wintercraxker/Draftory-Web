"use client";
import { useEffect, useState } from "react";
export function ModerationStatus() {
  const [state, setState] = useState<{
    staff: boolean;
    communication?: {
      id: string;
      kind: string;
      publicReason: string;
      endsAt: string | null;
    }[];
    suspension: {
      publicReason: string;
      startsAt: string;
      endsAt: string | null;
      state: string;
    } | null;
  }>();
  useEffect(() => {
    const c = new AbortController();
    const read = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/moderation", {
          signal: c.signal,
          cache: "no-store",
        });
        if (r.ok && !c.signal.aborted) setState(await r.json());
      } catch {}
    };
    void read();
    const timer = setInterval(read, 60000);
    window.addEventListener("focus", read);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, []);
  if (!state?.suspension && !state?.communication?.length) return null;
  return (
    <div className="mb-5 space-y-3">
      {state?.communication?.map((s) => (
        <aside
          key={s.id}
          className="rounded-xl border border-amber-800 bg-zinc-900 p-4"
        >
          <h2 className="text-sm font-semibold text-amber-200">
            {s.kind === "MUTE"
              ? "Chat silenciado temporalmente"
              : "Advertencia del staff"}
          </h2>
          <p className="mt-2 text-xs text-zinc-400">{s.publicReason}</p>
          {s.endsAt && (
            <p className="mt-2 text-xs text-zinc-500">
              Hasta {new Date(s.endsAt).toLocaleString("es-CO")}
            </p>
          )}
        </aside>
      ))}
      {state?.suspension && (
        <aside className="rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-4">
          <h2 className="text-sm font-semibold text-amber-200">
            Cuenta suspendida
          </h2>
          <p className="mt-2 text-xs text-zinc-400">
            Motivo: {state.suspension.publicReason}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Inicio:{" "}
            {new Date(state.suspension.startsAt).toLocaleString("es-CO")} ·
            Estado: activa
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Finaliza:{" "}
            {state.suspension.endsAt
              ? new Date(state.suspension.endsAt).toLocaleString("es-CO")
              : "Suspensión permanente"}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Puedes consultar Draftory. Las nuevas participaciones competitivas
            están bloqueadas.
          </p>
        </aside>
      )}
    </div>
  );
}
