"use client";
import { useEffect, useState } from "react";
import { DropdownField } from "./Dropdown";
import { DotaMedal } from "./DotaMedal";
import { normalizeRank } from "@/lib/dota-stats/normalize";
export type DeclaredMedal = {
  rankTier: number;
  state: string;
  rank: ReturnType<typeof normalizeRank>;
} | null;
export function ManualMedal({
  userId,
  canDeclare,
}: {
  userId: string;
  canDeclare: boolean;
}) {
  const [medal, setMedal] = useState<DeclaredMedal>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/profile/medal?handle=" + encodeURIComponent(userId), {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.ok && !c.signal.aborted) setMedal(await r.json());
      })
      .catch(() => {});
    return () => c.abort();
  }, [userId]);
  const tiers = Array.from(
    { length: 35 },
    (_, i) => (Math.floor(i / 5) + 1) * 10 + (i % 5) + 1,
  ).concat(80);
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 p-4">
      {medal?.rank && (
        <div className="flex items-center gap-3">
          <DotaMedal
            rankTier={medal.rankTier}
            name={medal.rank.name}
            image={medal.rank.image}
          />
          <div className="text-xs">
            <p>{medal.rank.name}</p>
            <p className="mt-1 text-zinc-500">
              {medal.state === "MANUAL_VERIFIED"
                ? "Declaración validada por staff"
                : "Medalla declarada · pendiente de verificación"}
            </p>
          </div>
        </div>
      )}
      {canDeclare && (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const tier = Number(new FormData(e.currentTarget).get("rankTier"));
            const r = await fetch("/api/profile/medal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rankTier: tier }),
            });
            const v = await r.json();
            if (r.ok) {
              setMedal(v);
              setNotice(
                "Declaración guardada. No verifica estadísticas ni MMR.",
              );
            } else setNotice(v.error);
          }}
        >
          <label className="min-w-48 text-xs text-zinc-400">
            Medalla declarada
            <DropdownField
              key={medal?.rankTier ?? "new"}
              name="rankTier"
              label="Medalla declarada"
              defaultValue={String(medal?.rankTier ?? 11)}
              options={tiers.map((t) => ({
                value: String(t),
                label:
                  normalizeRank(t)!.name +
                  (t === 80 ? "" : " " + (t % 10) + " \u2605"),
              }))}
            />
          </label>
          <button className="dashboard-button px-4 py-2 text-xs">
            Guardar declaración
          </button>
        </form>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs text-zinc-400">
          {notice}
        </p>
      )}
    </div>
  );
}
