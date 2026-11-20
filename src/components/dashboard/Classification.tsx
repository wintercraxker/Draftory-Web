"use client";

import Image from "next/image";
import Link from "next/link";
import { profileHandle, profileHref } from "@/lib/player-profiles";
import { AvatarImage } from "./AvatarIdentity";
import { CurrentUserBadge, PlayerName } from "./PlayerIdentity";
import { useState, useCallback } from "react";
import type { RankingPage } from "@/lib/real/ranking-repository";
import { Trophy, MapPin, ArrowUpRight } from "lucide-react";
import { PodiumEmblem } from "./PodiumEmblem";
import { type Player } from "@/lib/competitive";
import { matchesClassification } from "@/lib/classification-search";
import { ClassificationSearch, SearchHighlight } from "./ClassificationSearch";
import { buildClassification } from "@/lib/classification-data";
import type { DashboardMatch } from "@/lib/dashboard-data";
import { PageHeader, EmptyState } from "./DashboardUi";

function Avatar({
  player,
  className = "",
  size = 42,
}: {
  player: Player;
  className?: string;
  size?: number;
}) {
  return (
    <Link
      href={profileHref(player)}
      prefetch={false}
      aria-label={`Abrir perfil de ${player.name}`}
      className="player-profile-avatar"
    >
      <AvatarImage
        responsive
        id={player.id}
        src={player.avatar}
        size={size}
        alt={player.name}
        className={`ranking-avatar object-cover object-center ${className}`}
      />
    </Link>
  );
}
export function Classification({
  player,
  country,
  role,
  matches,
  onProfile,
  data,
  onQuery,
}: {
  player: Player;
  country: string;
  role: string;
  matches: DashboardMatch[];
  onProfile: () => void;
  data?: RankingPage;
  onQuery?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const sorted = data
    ? data.podium
    : buildClassification({ ...player, country, role }, matches);
  const self = data
    ? data.currentUser
    : sorted.find((record) => record.id === player.id)!;
  const remaining = data
    ? data.rows
    : query.trim()
      ? sorted.filter((record) =>
          matchesClassification(
            { ...record, username: profileHandle(record) },
            query,
          ),
        )
      : sorted.slice(3);
  const changeQuery = useCallback(
    (q: string) => {
      setQuery(q);
      onQuery?.(q);
    },
    [onQuery],
  );
  return (
    <section className="classification-panel dashboard-enter">
      <PageHeader
        eyebrow="Competitivo / ELO Draftory"
        title="Clasificación"
        description="Los jugadores que marcan el ritmo de la arena."
        action={
          !data && (
            <span className="dashboard-mode-badge">Temporada de ejemplo</span>
          )
        }
      />
      <div
        className="ranking-podium dashboard-panel"
        aria-label="Podio de clasificación"
      >
        <div className="ranking-podium-grid">
          {sorted.slice(0, 3).map((record, index) => (
            <article
              key={record.id}
              className={`ranking-podium-player ranking-podium-${index + 1}`}
            >
              <span className="ranking-podium-icon">
                <PodiumEmblem place={(index + 1) as 1 | 2 | 3} />
              </span>
              <div className="ranking-avatar-ring">
                <Avatar player={record} size={index === 0 ? 104 : 88} />
              </div>
              <div className="ranking-podium-identity">
                <h2>
                  <PlayerName player={record} className="ranking-name" />
                  {record.id === player.id && <CurrentUserBadge />}
                </h2>
              </div>
              <p className="ranking-country">{record.country}</p>
              <p className="ranking-podium-elo">
                {record.elo.toLocaleString("en-US")} <span>ELO</span>
              </p>
              <div className="ranking-podium-step">
                <span className="ranking-podium-number">{index + 1}</span>
                <span className="ranking-podium-caption">
                  {index === 0
                    ? "Primer puesto"
                    : index === 1
                      ? "Segundo puesto"
                      : "Tercer puesto"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
      {self ? (
        <div className="ranking-own-position">
          <div>
            <span className="dashboard-label">Tu posición</span>
            <p>
              <strong>#{self.position}</strong>
              <Avatar player={self} size={36} />
              <span className="player-name-row">
                <PlayerName player={self} />
                <CurrentUserBadge />
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold tabular-nums text-violet-100">
              {self.elo.toLocaleString("en-US")}{" "}
              <small className="text-[10px] font-normal text-zinc-500">
                ELO
              </small>
            </span>
            <button
              onClick={onProfile}
              className="dashboard-link-button text-xs"
            >
              Mi perfil
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <p className="ranking-own-position text-xs text-zinc-400">
          Tu perfil privado no aparece en esta clasificación pública.
        </p>
      )}
      <div className="ranking-list-heading">
        <div>
          <h2 className="dashboard-section-title">Clasificación general</h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            {data
              ? "Ordenada por ELO Draftory"
              : "Ordenada por ELO Draftory · datos demo"}
          </p>
        </div>
        <ClassificationSearch
          players={data ? data.rows : sorted}
          currentUserId={player.id}
          onQuery={changeQuery}
        />
      </div>
      <div
        className="ranking-list competitive-table"
        role="table"
        aria-label="Clasificación general"
      >
        <div className="ranking-list-columns ranking-list-labels" role="row">
          <span role="columnheader">Puesto</span>
          <span role="columnheader">Jugador</span>
          <span role="columnheader">ELO Draftory</span>
          <span role="columnheader">Partidas</span>
          <span role="columnheader">Winrate</span>
        </div>
        {remaining.map((record) => {
          return (
            <article
              key={record.id}
              role="row"
              className={`ranking-list-columns ranking-list-row ${record.id === player.id ? "ranking-list-self" : ""}`}
            >
              <div role="cell" className="ranking-position">
                #{record.position}
              </div>
              <div role="cell" className="ranking-player">
                <Avatar player={record} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlayerName player={record} className="ranking-name">
                      <SearchHighlight text={record.name} query={query} />
                    </PlayerName>
                    {record.id === player.id && <CurrentUserBadge />}
                    {record.badge && (
                      <span
                        className={`ranking-staff-badge ranking-staff-${record.rank}`}
                      >
                        {record.rank && (
                          <Image
                            src={`/${record.rank}.svg`}
                            alt=""
                            width={12}
                            height={12}
                            unoptimized
                          />
                        )}
                        {record.badge}
                      </span>
                    )}
                  </div>
                  {"forecastWins" in record &&
                    Number(record.forecastWins) > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Pronósticos: {Number(record.forecastWins)} aciertos ·
                        Sin efecto en ELO
                      </p>
                    )}
                  <p className="ranking-country">
                    <MapPin size={10} />
                    <SearchHighlight text={record.country} query={query} />
                  </p>
                </div>
              </div>
              <div role="cell" className="ranking-value ranking-elo">
                <strong>{record.elo.toLocaleString("en-US")}</strong>
                <small>ELO Draftory</small>
              </div>
              <div role="cell" className="ranking-value">
                <strong>{record.played?.toLocaleString("en-US") ?? "—"}</strong>
                <small>Partidas</small>
              </div>
              <div role="cell" className="ranking-value">
                <strong>
                  {record.winrate !== undefined
                    ? `${Math.round(record.winrate)}%`
                    : "—"}
                </strong>
                <small>Winrate</small>
              </div>
            </article>
          );
        })}
        {!remaining.length && (
          <EmptyState
            compact
            icon={Trophy}
            title="No encontramos jugadores."
            description="Prueba otro nombre o país en la clasificación general."
          />
        )}
      </div>
    </section>
  );
}
