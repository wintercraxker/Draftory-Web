"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClanHistory as History } from "@/lib/real/clan-history-repository";
import { roomModeLabel } from "@/lib/rooms/lobby-options.mjs";
import s from "./ClanPanel.module.css";
export function ClanHistory({ clanId }: { clanId: string }) {
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data: History | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  const key = `${clanId}:${page}:${retry}`,
    loading = response.key !== key,
    data = loading ? null : response.data,
    error = loading ? "" : response.error;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/clans/${encodeURIComponent(clanId)}/matches?page=${page}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error ?? "No se pudo leer el historial.");
        if (!controller.signal.aborted)
          setResponse({ key, data: body, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResponse({ key, data: null, error: e.message });
      });
    return () => controller.abort();
  }, [clanId, page, key]);
  useEffect(() => {
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener("draftory:results-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("draftory:results-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <section
      className={s.section}
      aria-label="Historial competitivo del clan"
      aria-busy={loading}
    >
      <div className={s.sectionTitle}>
        <h2>Historial del equipo</h2>
        {data && (
          <span className={s.secondary}>
            {data.statistics.played} partidas · {data.statistics.wins} victorias
            · {data.statistics.losses} derrotas
            {data.statistics.winRate !== null
              ? ` · ${data.statistics.winRate}% victorias`
              : ""}
          </span>
        )}
      </div>
      <p className={s.secondary}>
        Resultados 5v5 verificados con cinco integrantes del clan en el mismo
        equipo al preparar la partida.
      </p>
      {error ? (
        <p className={s.error} role="alert">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
        </p>
      ) : loading ? (
        <p role="status">Cargando historial…</p>
      ) : data?.records.length ? (
        <div>
          {data.records.map((match) => (
            <Link
              className={s.request}
              key={match.id}
              href={"/partidas/" + encodeURIComponent(match.id)}
            >
              <span>
                <strong>{match.result}</strong>
                <small>
                  {roomModeLabel(match.mode)} ·{" "}
                  {match.side === "RADIANT" ? "Radiant" : "Dire"}
                </small>
              </span>
              <time dateTime={match.finishedAt}>
                {new Date(match.finishedAt).toLocaleDateString("es-ES")}
              </time>
            </Link>
          ))}
        </div>
      ) : (
        <p className={s.empty}>
          Aún no hay partidas verificadas representando al clan.
        </p>
      )}
      {data && (page > 1 || data.hasMore) && (
        <div className={s.pagination}>
          <button
            disabled={loading || page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            disabled={loading || !data.hasMore}
            onClick={() => setPage((n) => n + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
