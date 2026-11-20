import Image from "next/image";
import type {
  DotaProfileBundle,
  DotaHero,
  DotaWinLoss,
  DotaPlayerStats,
  StratzAnalytics,
} from "@/lib/dota-stats/types";
import { SectionHeader } from "./DashboardUi";
import { selectMainHero } from "@/lib/dota-presentation";
import { HeroShowcase } from "./HeroShowcase";
import { profileDataState } from "@/lib/dota-stats/profile-state";
import { DotaPrivacyNotice } from "./DotaPrivacyNotice";

export function DotaProfileStats({
  data,
  isOwner = true,
}: {
  data: DotaProfileBundle;
  isOwner?: boolean;
}) {
  const state = profileDataState(data);
  const wl = data.winloss.data as DotaWinLoss | null,
    stats = data.performance.data as DotaPlayerStats | null;
  const heroes = (data.heroes.data as DotaHero[] | null)?.slice(0, 5) ?? [];
  const main = selectMainHero((data.heroes.data as DotaHero[] | null) ?? []);
  const catalogMain =
    main && data.catalog.find((h) => h.heroId === main.hero.heroId);
  const analytics = data.analytics?.data as StratzAnalytics | null;
  const metric = (value: number | null | undefined, digits = 0) =>
    value == null
      ? "—"
      : value.toLocaleString("es-CO", { maximumFractionDigits: digits });
  return (
    <section
      className="dashboard-panel rounded-2xl p-5 sm:p-6"
      aria-labelledby="external-dota-stats"
    >
      <SectionHeader
        id="external-dota-stats"
        eyebrow="Dota 2"
        title="Estadísticas de Dota 2"
      />
      {state !== "AVAILABLE" && (
        <DotaPrivacyNotice isOwner={isOwner} state={state} />
      )}
      {!wl && !stats && !heroes.length ? null : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Partidas", metric(wl?.games)],
              ["Victorias", metric(wl?.wins)],
              ["Derrotas", metric(wl?.losses)],
              [
                "Winrate",
                wl?.winrate == null ? "—" : metric(wl.winrate, 1) + "%",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="dashboard-label">{label}</dt>
                <dd className="mt-2 text-xl font-semibold tabular-nums text-zinc-200">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {stats && (
            <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
              {[
                ["KDA", metric(stats.kda, 2)],
                ["GPM", metric(stats.goldPerMinute)],
                ["XPM", metric(stats.experiencePerMinute)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="dashboard-label">{label}</dt>
                  <dd className="mt-2 text-lg tabular-nums text-zinc-300">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {main && catalogMain && (
            <section
              className="dota-hero-section mt-6"
              aria-labelledby="main-dota-hero"
            >
              <div className="dota-hero-copy">
                <p className="dashboard-label">Héroe más jugado</p>
                <h3
                  id="main-dota-hero"
                  className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl lg:text-4xl"
                >
                  {catalogMain.name}
                </h3>
                <dl className="dota-hero-metrics">
                  {[
                    ["Partidas", metric(main.hero.games)],
                    ["Victorias", metric(main.hero.wins)],
                    [
                      "Winrate",
                      ((main.hero.wins / main.hero.games) * 100).toFixed(1) +
                        "%",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dd className="text-xl font-semibold tabular-nums text-zinc-100">
                        {value}
                      </dd>
                      <dt className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                        {label}
                      </dt>
                    </div>
                  ))}
                </dl>
                {main.hero.lastPlayed && (
                  <p className="mt-5 text-xs text-zinc-500">
                    Última partida ·{" "}
                    {new Date(main.hero.lastPlayed).toLocaleDateString(
                      "es-CO",
                      { timeZone: "UTC" },
                    )}
                  </p>
                )}
              </div>
              <HeroShowcase data={data} />
            </section>
          )}
          {heroes.some((hero) => hero.heroId !== main?.hero.heroId) && (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <h3 className="dashboard-label">Otros héroes más jugados</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {heroes
                  .filter((hero) => hero.heroId !== main?.hero.heroId)
                  .map((hero) => {
                    const catalog = data.catalog.find(
                      (h) => h.heroId === hero.heroId,
                    );
                    return (
                      <div
                        key={hero.heroId}
                        className="dota-hero-other flex min-w-0 items-center gap-3"
                      >
                        <div className="w-16 shrink-0">
                          {catalog && (
                            <Image
                              unoptimized
                              src={catalog.image}
                              alt=""
                              width={56}
                              height={32}
                              className="rounded object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-200">
                            {catalog?.name ?? `Héroe #${hero.heroId}`}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {metric(hero.games)} partidas · {metric(hero.wins)}{" "}
                            victorias
                          </p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                          {hero.winrate == null
                            ? "—"
                            : metric(hero.winrate, 1) + "%"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {[data.winloss, data.heroes, data.performance].some(
            (d) => d.status === "stale",
          ) && (
            <p role="status" className="mt-4 text-[11px] text-zinc-500">
              Algunas estadísticas conservan la última información disponible.
            </p>
          )}
          {analytics?.isStratzPublic && (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <h3 className="dashboard-label">
                {isOwner ? "Análisis STRATZ" : "Rendimiento adicional"}
              </h3>
              {analytics.imp !== null && (
                <p className="mt-3 text-sm text-zinc-300">
                  IMP{" "}
                  <strong className="ml-2 tabular-nums">{analytics.imp}</strong>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                {analytics.roles.map((role) => (
                  <p key={role.role} className="text-xs text-zinc-400">
                    {
                      (
                        {
                          CORE: "Core",
                          LIGHT_SUPPORT: "Support",
                          HARD_SUPPORT: "Hard Support",
                          UNKNOWN: "Sin clasificar",
                        } as Record<string, string>
                      )[role.role]
                    }{" "}
                    · {role.games} partidas · {role.winrate?.toFixed(1) ?? "—"}%
                  </p>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-500">
                Categorías del proveedor, independientes de tus roles Draftory.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
