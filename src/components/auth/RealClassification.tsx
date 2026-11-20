"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { Classification } from "@/components/dashboard/Classification";
import type { RankingPage } from "@/lib/real/ranking-repository";
export function RealClassification({ onProfile }: { onProfile: () => void }) {
  const { user } = useAuth(),
    [data, setData] = useState<RankingPage | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const changeQuery = useCallback((q: string) => {
    setQuery(q);
    setPage(1);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    const load = () =>
      fetch(`/api/ranking?q=${encodeURIComponent(query)}&page=${page}`, {
        cache: "no-store",
        signal: c.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((v) => {
          if (!c.signal.aborted) {
            setData(v);
            setError("");
          }
        })
        .catch(() => {
          if (!c.signal.aborted)
            setError("No se pudo actualizar la clasificación.");
        });
    void load();
    window.addEventListener("focus", load);
    window.addEventListener("draftory:results-updated", load);
    window.addEventListener("draftory:identity-updated", load);
    return () => {
      c.abort();
      window.removeEventListener("focus", load);
      window.removeEventListener("draftory:results-updated", load);
      window.removeEventListener("draftory:identity-updated", load);
    };
  }, [query, page, user?.name, user?.avatar]);
  if (!user?.player) return null;
  if (!data)
    return (
      <p role="status" className="text-sm text-zinc-400">
        {error || "Cargando clasificación…"}
      </p>
    );
  return (
    <>
      <Classification
        player={user.player}
        country={user.player.country}
        role={user.player.preferredRolePrimary}
        matches={[]}
        onProfile={onProfile}
        data={data}
        onQuery={changeQuery}
      />
      {error && (
        <p role="status" className="mt-3 text-xs text-zinc-400">
          {error}
        </p>
      )}
      {data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
          <button
            className="dashboard-button px-3 py-2"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page} de {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            className="dashboard-button px-3 py-2"
            disabled={page * data.pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}
