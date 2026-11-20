"use client";

import { useState } from "react";
import { ArrowUpRight, Trophy, Users, TrendingUp } from "lucide-react";
import { EloValue } from "./EloValue";
import { XpProgress } from "./XpProgress";
import { RecentMatches } from "./RecentMatches";
import { PageHeader, SectionHeader, StatCard } from "./DashboardUi";
import {
  activityPeriods as periods,
  getMatchStats,
  getRecentElo,
  type DashboardMatch,
} from "@/lib/dashboard-data";
import type { DraftoryStatistics } from "@/lib/real/statistics-repository";
import { activityCounts } from "@/lib/draftory-activity";
import { WinrateDonut } from "./WinrateDonut";

const panel = "dashboard-panel rounded-2xl";

export function Overview({
  name,
  xp,
  elo,
  matches,
  onRooms,
  realData,
  ownerId,
}: {
  realData?: DraftoryStatistics;
  ownerId?: string;
  matches: DashboardMatch[];
  name: string;
  xp: number | bigint | string;
  elo: number;
  onRooms: () => void;
}) {
  const [period, setPeriod] = useState<keyof typeof periods>("7d");
  const data = realData
    ? {
        ...periods[period],
        counts: activityCounts(
          realData.activity,
          realData.serverNow,
          Number.parseInt(period),
        ),
      }
    : periods[period];
  const {
    played: total,
    wins,
    winrate,
  } = realData?.metrics ?? getMatchStats(matches);
  const recentElo = realData
    ? {
        ...realData.recentElo,
        played: realData.recentElo.count,
        complete: true,
      }
    : getRecentElo(matches);
  const eloValue = recentElo.count
    ? `${recentElo.total > 0 ? "+" : ""}${recentElo.total.toLocaleString("en-US")} ELO`
    : "—";
  const eloDetail = `Últimas 5 partidas competitivas${recentElo.played && !recentElo.complete ? ` · ${recentElo.count}/${recentElo.played} con ELO registrado` : ""}`;
  const max = Math.max(...data.counts, 1);
  const points = data.counts
    .map((count, index) => `${40 + index * 90},${190 - (count / max) * 140}`)
    .join(" ");

  return (
    <section className="dashboard-enter">
      <div className="dashboard-panel dashboard-overview-hero">
        <PageHeader
          eyebrow="Draftory / Resumen"
          title={`Tu resumen, ${name}`}
          description="Tu actividad competitiva y progreso en Draftory."
        />
        <div className="dashboard-overview-progress">
          <div className="dashboard-overview-elo">
            <p className="dashboard-label">ELO Draftory</p>
            <strong>
              <EloValue value={elo} />
            </strong>
          </div>
          <div className="min-w-0">
            <XpProgress xp={xp} />
          </div>
        </div>
      </div>
      <div data-overview-metrics className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Victorias"
          value={wins}
          icon={Trophy}
          detail="Resultados de tu historial"
        />
        <StatCard
          label="ELO ganado"
          value={eloValue}
          icon={TrendingUp}
          detail={eloDetail}
          tone={
            recentElo.total > 0
              ? "positive"
              : recentElo.total < 0
                ? "negative"
                : "neutral"
          }
          index={1}
        />
        <StatCard
          label="Reconocimiento"
          value={realData?.metrics.commends ?? 0}
          icon={Users}
          detail={`Commends recibidos${realData?.metrics.mvps ? ` · ${realData.metrics.mvps} MVP` : ""}`}
          index={2}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className={`${panel} min-w-0 p-5 sm:p-6`}>
          <SectionHeader
            eyebrow="Actividad"
            title="Actividad de partidas"
            description={`${data.label}${realData ? " · partidas verificadas" : " · actividad de ejemplo"}`}
            action={
              <div className="dashboard-tabs" aria-label="Período de actividad">
                {(Object.keys(periods) as (keyof typeof periods)[]).map(
                  (key) => (
                    <button
                      key={key}
                      onClick={() => setPeriod(key)}
                      aria-pressed={key === period}
                    >
                      {key}
                    </button>
                  ),
                )}
              </div>
            }
          />
          <svg
            viewBox="0 0 600 225"
            role="img"
            aria-label={`${data.label}: ${data.counts.join(", ")} partidas por intervalo`}
            preserveAspectRatio="none"
            className="dashboard-activity-chart mt-5"
          >
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity=".22" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((index) => (
              <g key={index}>
                <line
                  x1="40"
                  x2="580"
                  y1={190 - index * 46.67}
                  y2={190 - index * 46.67}
                  stroke="#202024"
                  strokeDasharray="3 5"
                />
                <text
                  x="18"
                  y={194 - index * 46.67}
                  fill="#52525b"
                  fontSize="9"
                >
                  {Math.round((max * index) / 3)}
                </text>
              </g>
            ))}
            <polygon
              points={`40,190 ${points} 580,190`}
              fill="url(#activity-fill)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#c4b5fd"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {data.counts.map((count, index) => (
              <g key={index}>
                <circle
                  cx={40 + index * 90}
                  cy={190 - (count / max) * 140}
                  r="3"
                  fill="#c4b5fd"
                >
                  <title>{`${count} partidas`}</title>
                </circle>
                <text
                  x={40 + index * 90}
                  y="218"
                  textAnchor="middle"
                  fill="#71717a"
                  fontSize="9"
                >
                  {period === "7d"
                    ? realData
                      ? new Date(
                          Date.parse(realData.serverNow.slice(0, 10)) +
                            (index - 6) * 86400000,
                        ).toLocaleDateString("es", {
                          weekday: "short",
                          timeZone: "UTC",
                        })
                      : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][index]
                    : `Tramo ${index + 1}`}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className={`${panel} p-5 sm:p-6`}>
          <SectionHeader eyebrow="Rendimiento" title="Tu rendimiento" />
          <WinrateDonut winrate={winrate} played={total} />
          <p className="text-center text-xs text-zinc-400">
            {wins} {wins === 1 ? "victoria" : "victorias"}
            <span className="mx-2 text-zinc-700">·</span>
            {total - wins} {total - wins === 1 ? "derrota" : "derrotas"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={`${panel} p-5 sm:p-6`}>
          <SectionHeader
            eyebrow="Historial"
            title="Últimas partidas"
            description="Tus resultados más recientes."
          />
          <div className="mt-3">
            <RecentMatches ownerId={ownerId} matches={matches} limit={3} />
          </div>
        </div>
        <div className={`${panel} flex flex-col items-start p-5 sm:p-6`}>
          <span className="dashboard-feature-icon">
            <Users size={20} strokeWidth={1.8} />
          </span>
          <p className="dashboard-eyebrow mt-5">Vuelve a la arena</p>
          <h2 className="dashboard-section-title mt-2">
            Encuentra tu próximo stack
          </h2>
          <p className="dashboard-description max-w-sm">
            Explora salas abiertas, encuentra jugadores de tu región y empieza
            tu siguiente partida.
          </p>
          <button onClick={onRooms} className="dashboard-link-button mt-5">
            Explorar salas <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
