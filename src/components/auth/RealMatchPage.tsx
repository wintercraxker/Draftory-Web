"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { presentMatch } from "./RealMatches";
import { MatchDetails } from "../dashboard/MatchDetails";
import { LiveMatchCard } from "../dashboard/LiveMatchCard";
import type { DashboardMatch } from "@/lib/dashboard-data";
export function RealMatchPage({ id }: { id: string }) {
  const router = useRouter(),
    query = useSearchParams();
  const from = query.get("from");
  const back = ["mine", "live", "history"].includes(from ?? "")
    ? `/partidas?tab=${from}`
    : "/partidas";
  const { user } = useAuth();
  const [state, setState] = useState<{
    id: string;
    match?: DashboardMatch;
    error?: string;
  }>({ id });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    let pending = false,
      finished = false;
    async function read() {
      if (
        pending ||
        finished ||
        c.signal.aborted ||
        document.visibilityState === "hidden"
      )
        return;
      pending = true;
      try {
        const r = await fetch(`/api/matches/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: c.signal,
        });
        const data = await r.json();
        if ([401, 403, 404].includes(r.status)) {
          if (!c.signal.aborted) {
            finished = true;
            setState({ id, error: data.error ?? "Partida no disponible." });
          }
          return;
        }
        if (!r.ok) throw Error(data.error ?? "No se pudo cargar la partida.");
        if (!c.signal.aborted) {
          finished = ["COMPLETED", "CANCELLED"].includes(data.record.status);
          setState({ id, match: presentMatch(data.record) });
        }
      } catch (e) {
        if (!c.signal.aborted)
          setState((previous) =>
            previous.id === id && previous.match
              ? {
                  id,
                  match: {
                    ...previous.match,
                    statusLabel:
                      "Seguimiento no disponible · reserva protegida",
                    liveStartedAt: null,
                    tracking: previous.match.tracking
                      ? {
                          ...previous.match.tracking,
                          activity: "UNKNOWN",
                          label:
                            "Seguimiento no disponible · reserva protegida",
                        }
                      : undefined,
                  },
                }
              : {
                  id,
                  error:
                    e instanceof Error
                      ? e.message
                      : "No se pudo cargar la partida.",
                },
          );
      } finally {
        pending = false;
      }
    }
    void read();
    const timer = setInterval(() => void read(), 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      c.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, retry]);
  const active =
    state.match &&
    ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"].includes(
      state.match.status ?? "",
    ) &&
    state.match.roomId;
  return (
    <section aria-label="Detalle de partida" className="dedicated-match-page">
      <Link href={back} className="match-back-control">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a partidas
      </Link>
      {state.id !== id || (!state.match && !state.error) ? (
        <p role="status">Cargando estadísticas de la partida…</p>
      ) : state.error ? (
        <div role="alert">
          <h1>Partida no disponible</h1>
          <p>{state.error}</p>
          <button
            className="dashboard-secondary-button mt-4"
            onClick={() => setRetry((n) => n + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : active ? (
        <div className="dashboard-browse-matches mt-4">
          <h1 className="sr-only">{state.match!.name}</h1>
          <LiveMatchCard
            match={{
              ...state.match!,
              radiant: state.match!.radiant ?? {},
              dire: state.match!.dire ?? {},
            }}
            statusLabel={state.match!.statusLabel}
            participant={false}
            actionLabel="Abrir sala y chat"
            onOpen={() =>
              router.push(
                "/salas?room=" + encodeURIComponent(state.match!.roomId!),
              )
            }
          />
        </div>
      ) : (
        <MatchDetails
          match={state.match!}
          ownerId={user?.id}
          ownerName={user?.name}
        />
      )}
    </section>
  );
}
