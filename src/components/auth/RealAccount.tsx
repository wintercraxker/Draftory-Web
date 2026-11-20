"use client";
import { playSound } from "@/lib/sounds/engine";
import { useEffect, useState, useRef } from "react";
import type { DotaProfileBundle } from "@/lib/dota-stats/types";
import type { RealProfile } from "@/lib/real/types";
import type { Achievement } from "@/lib/progression/config";
import { PlayerProfile } from "@/components/dashboard/PlayerProfile";
import { presentMatch } from "./RealMatches";
import type { DashboardMatch } from "@/lib/dashboard-data";
import type { RealMatch } from "@/lib/real/match-repository";
import { AvatarEditor } from "@/components/dashboard/AvatarEditor";
import { useDraftoryStatistics } from "./useDraftoryStatistics";
import { useAuth } from "./AuthProvider";
import { AccountSettings } from "./AccountSettings";

export function RealAccount({
  profile,
  editing,
  onEdit,
  onSaved,
  readOnly = false,
}: {
  profile: RealProfile;
  editing: boolean;
  readOnly?: boolean;
  onEdit: () => void;
  onSaved: (profile: RealProfile) => void;
}) {
  const { data: internalStats, error: statsError } = useDraftoryStatistics(
    profile.id,
  );
  const [busy, setBusy] = useState(false),
    [notice, setNoticeValue] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error" | "info">(
    "info",
  );
  function setNotice(
    value: string,
    tone: "success" | "error" | "info" = "error",
  ) {
    setNoticeValue(value);
    setNoticeTone(value ? tone : "info");
  }
  const { refresh, updateIdentity, wallet } = useAuth();
  const lastLevel = useRef({ id: profile.id, level: profile.level });
  useEffect(() => {
    if (
      !readOnly &&
      lastLevel.current.id === profile.id &&
      profile.level > lastLevel.current.level
    )
      void playSound(
        "reward",
        "rewards",
        `level:${profile.id}:${profile.level}`,
      );
    lastLevel.current = { id: profile.id, level: profile.level };
  }, [profile.id, profile.level, readOnly]);
  const rewardIdentity = useRef({ onSaved, updateIdentity, refresh });
  useEffect(() => {
    rewardIdentity.current = { onSaved, updateIdentity, refresh };
  }, [onSaved, updateIdentity, refresh]);
  const [external, setExternal] = useState<DotaProfileBundle>(),
    [dotaBusy, setDotaBusy] = useState(false);
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [matches, setMatches] = useState<DashboardMatch[]>([]),
    [historyLoaded, setHistoryLoaded] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    let generation = 0;
    const read = () => {
      const current = ++generation;
      return fetch("/api/matches?handle=" + encodeURIComponent(profile.id), {
        signal: c.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          if (!r.ok) return;
          const v = await r.json();
          if (!c.signal.aborted && current === generation) {
            setMatches(v.records.map((row: RealMatch) => presentMatch(row)));
            setHistoryLoaded(true);
          }
        })
        .catch(() => {});
    };
    void read();
    window.addEventListener("focus", read);
    window.addEventListener("draftory:results-updated", read);
    return () => {
      c.abort();
      window.removeEventListener("focus", read);
      window.removeEventListener("draftory:results-updated", read);
    };
  }, [profile.id]);
  const [progress, setProgress] = useState<{
    achievements: Achievement[];
    metrics: {
      played: number;
      wins: number;
      losses: number;
      commends: number;
      mvps: number;
    };
  } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    const read = async () => {
      try {
        const response = await fetch(
          readOnly
            ? "/api/achievements?handle=" + encodeURIComponent(profile.id)
            : "/api/achievements",
          readOnly
            ? { signal: c.signal, cache: "no-store" }
            : {
                signal: c.signal,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              },
        );
        if (!response.ok) return;
        const value = await response.json();
        if (!c.signal.aborted) {
          setProgress(value);
          if (!readOnly) {
            if (BigInt(value.xpAwarded ?? "0") > 0) {
              const fresh = await fetch("/api/profile", {
                cache: "no-store",
                signal: c.signal,
              });
              if (fresh.ok && !c.signal.aborted) {
                const account = await fresh.json();
                rewardIdentity.current.onSaved(account);
                rewardIdentity.current.updateIdentity(account);
                await rewardIdentity.current.refresh();
              }
            }
            window.dispatchEvent(new Event("draftory:notifications-updated"));
            window.dispatchEvent(
              new CustomEvent("draftory:wallet-updated", {
                detail: { pointsAwarded: value.pointsAwarded },
              }),
            );
          }
        }
      } catch {}
    };
    void read();
    return () => c.abort();
  }, [profile.id, readOnly, profile.level, profile.elo]);
  useEffect(() => {
    const controller = new AbortController();
    const read = () => {
      fetch(
        "/api/dota-stats?bundle=true&handle=" + encodeURIComponent(profile.id),
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) return;
          const result = await response.json();
          if (!controller.signal.aborted) setExternal(result);
        })
        .catch(() => {});
    };
    read();
    window.addEventListener("focus", read);
    return () => {
      controller.abort();
      window.removeEventListener("focus", read);
    };
  }, [profile.id]);
  // Bounded reads only while a durable server-side lease is active. No providers.
  useEffect(() => {
    if (!external?.manualSync.syncing || readOnly) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 125000;
    const read = async () => {
      try {
        const r = await fetch("/api/dota-stats?bundle=true", {
          cache: "no-store",
          signal: c.signal,
        });
        if (r.ok) {
          const value = await r.json();
          if (!c.signal.aborted) setExternal(value);
          if (value.manualSync?.syncing && Date.now() < deadline)
            timer = setTimeout(() => void read(), 4000);
        }
      } catch {}
    };
    timer = setTimeout(() => void read(), 4000);
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [external?.manualSync.syncing, readOnly]);
  async function syncDota() {
    if (dotaBusy) return;
    setDotaBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/dota-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error();
      setExternal(await response.json());
      setNotice("Estado de los datos actualizado.", "success");
    } catch {
      setNotice("No se pudo sincronizar. Tu perfil sigue disponible.");
    } finally {
      setDotaBusy(false);
    }
  }
  async function avatarSaved(value: string) {
    const blob = await (await fetch(value)).blob(),
      form = new FormData();
    form.append("image", blob, "avatar.webp");
    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    onSaved(result);
    updateIdentity(result);
    await refresh();
  }
  async function restoreAvatar() {
    if (busy || readOnly) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      onSaved(result);
      updateIdentity(result);
      await refresh();
      setNotice("Avatar de Steam restaurado.", "success");
    } catch {
      setNotice("No se pudo restaurar la foto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  const avatarEditor = avatarEditing && !readOnly && (
    <AvatarEditor
      onClose={() => setAvatarEditing(false)}
      onSave={avatarSaved}
    />
  );
  if (editing && !readOnly)
    return (
      <AccountSettings
        profile={profile}
        external={external}
        dotaBusy={dotaBusy}
        busy={busy}
        notice={notice}
        noticeTone={noticeTone}
        onSync={syncDota}
        onAvatar={() => setAvatarEditing(true)}
        onRestore={restoreAvatar}
        avatarEditor={avatarEditor}
        onSave={async (data) => {
          if (busy) return;
          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/profile", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            void playSound("confirmation", "feedback", crypto.randomUUID());
            onSaved(result);
            updateIdentity(result);
            await refresh();
            setNotice("Cambios guardados.", "success");
          } catch (error) {
            void playSound("error", "feedback", crypto.randomUUID());
            setNotice(
              error instanceof Error ? error.message : "No se pudo guardar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  return (
    <>
      {avatarEditor}
      <PlayerProfile
        externalDota={external?.profile}
        externalBundle={external}
        forecasts={internalStats?.forecasts}
        demo={false}
        competitivePending={!historyLoaded || !internalStats}
        achievementsPending={!progress}
        recentElo={internalStats?.recentElo}
        stats={
          internalStats?.metrics ??
          (progress
            ? {
                ...progress.metrics,
                winrate: progress.metrics.played
                  ? (progress.metrics.wins / progress.metrics.played) * 100
                  : 0,
              }
            : undefined)
        }
        social={
          progress
            ? {
                commends: progress.metrics.commends,
                mvps: progress.metrics.mvps,
              }
            : undefined
        }
        publicView={readOnly}
        profile={{
          xpTotal: internalStats?.xp ?? profile.xp,
          id: profile.id,
          publicId: profile.publicId,
          name: profile.name,
          avatar: profile.avatar ?? undefined,
          username: profile.handle ?? undefined,
          bio: profile.bio,
          country: profile.country ?? "No especificado",
          region: profile.region ?? "No especificada",
          visibility: profile.visibility === "PRIVATE" ? "Privado" : "Público",
          preferredRolePrimary: profile.preferredRolePrimary,
          preferredRoleSecondary: profile.preferredRoleSecondary,
          elo: internalStats?.elo ?? profile.elo,
          xp: Number(internalStats?.xp ?? profile.xp),
          level: internalStats?.level ?? profile.level,
          mmr: profile.dota.mmr ?? 0,
          mmrAvailable: profile.dota.mmr !== null,
          mmrSource: profile.dota.mmrSource,
          dotaVisibility:
            profile.dota.visibility === "PRIVATE" ? "private" : "unknown",
        }}
        matches={matches}
        roomCount={internalStats?.roomCount ?? 0}
        achievements={progress?.achievements}
        points={
          internalStats?.points ??
          (!readOnly && wallet ? wallet.balance : profile.points)
        }
        createdAt={profile.createdAt}
        onAvatar={!readOnly ? () => setAvatarEditing(true) : undefined}
        onEdit={!readOnly ? onEdit : undefined}
      />
      {!external && profile.dota.mmr !== null && (
        <p className="text-sm text-zinc-300 mt-3">
          <strong>{profile.dota.mmr.toLocaleString("es-ES")} MMR</strong> ·{" "}
          {profile.dota.mmrSource === "STAFF_VERIFIED"
            ? "Verificado por Staff"
            : profile.dota.mmrSource === "DECLARED"
              ? "Pendiente de verificación"
              : "Dato externo guardado"}
        </p>
      )}
      {!!internalStats?.heroes.length && (
        <section
          className="dashboard-panel rounded-xl p-5 mt-5"
          aria-label="Héroes competitivos de Draftory"
        >
          <h2 className="dashboard-section-title">Héroes en Draftory · 5v5</h2>
          <p className="text-xs text-zinc-400 mt-2">
            Solo partidas verificadas; las estadísticas externas de Dota se
            muestran por separado.
          </p>
          <div className="grid gap-3 mt-4 sm:grid-cols-2 xl:grid-cols-4">
            {internalStats.heroes.map((h) => (
              <div
                className="border border-zinc-800 rounded-lg p-3"
                key={h.heroId}
              >
                <strong className="text-sm text-zinc-200">{h.name}</strong>
                <p className="text-xs text-zinc-400 mt-2">
                  {h.played} partidas · {h.wins} victorias ·{" "}
                  {Math.round(h.winrate)}%
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      {statsError && (
        <p role="alert" className="text-xs text-zinc-400">
          {statsError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-zinc-400">
          {notice}
        </p>
      )}
    </>
  );
}
