"use client";
import { useId, useState } from "react";
import Image from "next/image";
import { roomFormat, normalizeRoomMode } from "@/lib/rooms/lobby-options.mjs";
import type {
  AnalyticsPlayer,
  MatchAnalytics,
} from "@/lib/dota-stats/match-analytics";
import type { HeroCatalogEntry } from "@/lib/dota-stats/types";
import type { RoomPlayer } from "@/lib/rooms/engine";
import {
  kda,
  total,
  positionNames,
  positionPairs,
  standout,
} from "@/lib/dota-stats/match-display";
import { itemVisual } from "@/lib/dota-stats/items";
import { getHeroRenderUrl } from "@/lib/dota-presentation";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";
import { PlayerDotaMedal } from "./PlayerDotaMedal";
import { matchPosition } from "@/lib/dota-stats/match-position";
export type BattlePlayer = AnalyticsPlayer & {
  key: string;
  identity?: RoomPlayer;
  playedPosition?: ReturnType<typeof matchPosition>;
};
type BattleProps = {
  players: BattlePlayer[];
  catalog: HeroCatalogEntry[];
  matchId?: string;
  duration?: number | null;
  winner: "RADIANT" | "DIRE" | null;
  mode?: string;
  region?: string;
  date?: string;
  source: "EXTERNAL" | "DRAFTORY";
  provider?: string;
  officialMvp?: string | null;
  picksBans: MatchAnalytics["picksBans"];
  timeline: MatchAnalytics["timeline"];
};
const number = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-CO");
export function HeroPortrait({
  heroId,
  catalog,
  large = false,
}: {
  heroId: number | null;
  catalog: HeroCatalogEntry[];
  large?: boolean;
}) {
  const h = catalog.find((h) => h.heroId === heroId);
  return h ? (
    <Image
      src={h.image}
      alt={h.name}
      title={h.name}
      width={large ? 160 : 64}
      height={large ? 90 : 36}
      unoptimized
      className={large ? "battle-hero-large" : "battle-hero"}
    />
  ) : (
    <span
      className="battle-hero battle-hero-missing"
      aria-label="Héroe no disponible"
    >
      —
    </span>
  );
}
export function BattleIdentity({ player: p }: { player: BattlePlayer }) {
  return p.identity ? (
    <div className="battle-identity">
      <PlayerAvatar player={p.identity} size={28} />
      <PlayerName showLevel={false} player={p.identity} />
      <PlayerDotaMedal player={p.identity} />
    </div>
  ) : (
    <span className="battle-player-name">
      {p.accountId ? `Cuenta Dota ${p.accountId}` : "Jugador anónimo"}
    </span>
  );
}
export function MatchInventory({ player: p }: { player: AnalyticsPlayer }) {
  return (
    <div className="battle-inventory" aria-label="Objetos finales">
      {p.items.map((id, i) => {
        const item = itemVisual(id);
        return (
          <span
            key={i}
            className="battle-item"
            title={item?.name ?? (id ? `Objeto ${id}` : "Sin dato de objeto")}
          >
            {item?.image ? (
              <Image
                src={item.image}
                alt={item.name}
                width={32}
                height={24}
                unoptimized
              />
            ) : id ? (
              <span>{id}</span>
            ) : (
              <span aria-hidden="true">·</span>
            )}
          </span>
        );
      })}
      {p.neutralItem != null && p.neutralItem !== 0 && (
        <span
          className="battle-neutral"
          title={`Neutral: ${itemVisual(p.neutralItem)?.name ?? p.neutralItem}`}
        >
          {itemVisual(p.neutralItem)?.image ? (
            <Image
              src={itemVisual(p.neutralItem)!.image!}
              alt={itemVisual(p.neutralItem)!.name}
              width={32}
              height={24}
              unoptimized
            />
          ) : (
            p.neutralItem
          )}
        </span>
      )}
    </div>
  );
}
export function MatchBattleHeader(p: BattleProps) {
  return (
    <header
      className="battle-header"
      aria-label={
        p.winner
          ? `Victoria ${p.winner === "RADIANT" ? "Radiant" : "Dire"}`
          : "Resultado pendiente"
      }
    >
      <div className="battle-header-meta">
        <span>
          {p.source === "EXTERNAL"
            ? `Dota 2 · ${p.provider ?? "STRATZ"}`
            : "Partida Draftory"}
        </span>
        {p.matchId && <span>Match ID {p.matchId}</span>}
        <span>
          {p.source === "EXTERNAL"
            ? `Datos publicados por ${p.provider ?? "STRATZ"}`
            : "Participantes según Draftory; resultado solo cuando esté verificado"}
        </span>
      </div>
      <div className="battle-versus">
        {(["RADIANT", "DIRE"] as const).map((side, i) => (
          <div
            key={side}
            className={`battle-team-heading ${side.toLowerCase()} ${p.winner === side ? "is-winner" : ""}`}
          >
            <span>{side}</span>
            <strong>
              {number(
                total(
                  p.players.filter((v) => v.side === side),
                  "kills",
                  normalizeRoomMode(p.mode)
                    ? roomFormat(p.mode!).teamSize
                    : p.mode === "DOTA_GAMEMODE_1V1MID"
                      ? 1
                      : 5,
                ),
              )}
            </strong>
            <div className="battle-team-heroes">
              {p.players
                .filter((v) => v.side === side)
                .map((v) => (
                  <HeroPortrait
                    key={v.key}
                    heroId={v.heroId}
                    catalog={p.catalog}
                  />
                ))}
            </div>
            {p.winner === side && <b>VICTORIA</b>}
            {i === 0 && (
              <div className="battle-duration">
                {p.duration != null
                  ? `${Math.floor(p.duration / 60)}:${String(p.duration % 60).padStart(2, "0")}`
                  : "VS"}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="battle-header-meta">
        {p.mode && <span>{p.mode}</span>}
        {p.region && <span>{p.region}</span>}
        {p.date && (
          <time dateTime={p.date}>
            {new Date(p.date).toLocaleString("es-CO", { timeZone: "UTC" })} UTC
          </time>
        )}
        {!p.winner && <span>Resultado no disponible</span>}
      </div>
    </header>
  );
}
const metrics = [
  ["Nivel", "level"],
  ["LH", "lastHits"],
  ["DN", "denies"],
  ["GPM", "gpm"],
  ["XPM", "xpm"],
  ["Net worth", "netWorth"],
  ["Daño héroes", "heroDamage"],
  ["Daño estructuras", "towerDamage"],
  ["Curación", "heroHealing"],
] as const;
export function MatchScoreboard({
  side,
  players,
  catalog,
  winner,
}: {
  side: "RADIANT" | "DIRE";
  players: BattlePlayer[];
  catalog: HeroCatalogEntry[];
  winner: BattleProps["winner"];
}) {
  const rows = players.filter((p) => p.side === side),
    columns = metrics.filter(([, key]) => rows.some((p) => p[key] != null));
  return (
    <section className={`battle-scoreboard ${side.toLowerCase()}`}>
      <div className="battle-section-heading">
        <h3>{side}</h3>
        <span>
          {winner === side ? "Ganador · " : ""}
          {rows.length} jugadores
        </span>
      </div>
      <div
        className="battle-table-scroll"
        tabIndex={0}
        aria-label={`Estadísticas de ${side}, desplazamiento horizontal`}
      >
        <table>
          <thead>
            <tr>
              <th>Jugador / héroe</th>
              <th>Posición</th>
              <th>K / D / A</th>
              <th>KDA</th>
              {columns.map(([name]) => (
                <th key={name}>{name}</th>
              ))}
              <th>Objetos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => {
              const p = {
                ...record,
                playedPosition:
                  record.playedPosition ??
                  matchPosition({ position: record.position }),
              };
              return (
                <tr key={p.key}>
                  <th scope="row">
                    <div className="battle-table-player">
                      <HeroPortrait heroId={p.heroId} catalog={catalog} />
                      <div>
                        <BattleIdentity player={p} />
                        <span className="battle-hero-name">
                          {catalog.find((h) => h.heroId === p.heroId)?.name ??
                            "Héroe no disponible"}
                        </span>
                      </div>
                    </div>
                  </th>
                  <td>
                    {p.playedPosition ? (
                      <span
                        className="battle-played-position"
                        tabIndex={0}
                        title={p.playedPosition.source}
                        aria-label={`${p.playedPosition.label}. ${p.playedPosition.source}`}
                      >
                        <Image
                          src={p.playedPosition.image}
                          alt=""
                          width={20}
                          height={20}
                          unoptimized
                        />
                        <span>
                          {p.playedPosition.label}
                          {p.playedPosition.kind === "ASSIGNED" && (
                            <small>Asignada</small>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-zinc-500">No disponible</span>
                    )}
                  </td>
                  <td className="battle-kda">
                    {number(p.kills)} / {number(p.deaths)} / {number(p.assists)}
                  </td>
                  <td>{kda(p)?.toFixed(2) ?? "—"}</td>
                  {columns.map(([, key]) => (
                    <td key={key}>{number(p[key])}</td>
                  ))}
                  <td>
                    <MatchInventory player={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function MatchFeatured({
  player: p,
  catalog,
  official,
}: {
  player: BattlePlayer;
  catalog: HeroCatalogEntry[];
  official: boolean;
}) {
  const hero = catalog.find((h) => h.heroId === p.heroId),
    render = hero ? getHeroRenderUrl(hero.heroId, catalog) : null;
  return (
    <section className="battle-featured">
      {render && (
        <Image
          src={render}
          alt=""
          width={260}
          height={300}
          unoptimized
          className="battle-featured-art"
        />
      )}
      <div className="battle-featured-content">
        <p className="battle-eyebrow">
          {official
            ? "MVP Draftory · Commends"
            : "Rendimiento destacado · KDA calculado"}
        </p>
        <div className="battle-featured-player">
          <HeroPortrait heroId={p.heroId} catalog={catalog} large />
          <div>
            <BattleIdentity player={p} />
            <h3>{hero?.name ?? "Héroe no disponible"}</h3>
            <p>
              {p.position
                ? positionNames[Number(p.position.slice(-1)) - 1]
                : ""}
              {p.level != null ? ` · Nivel ${p.level}` : ""}
            </p>
          </div>
        </div>
        <div className="battle-featured-metrics">
          <div>
            <small>K / D / A</small>
            <strong>
              {number(p.kills)} / {number(p.deaths)} / {number(p.assists)}
            </strong>
          </div>
          {(["netWorth", "heroDamage", "towerDamage", "heroHealing"] as const)
            .filter((k) => p[k] != null)
            .map((k) => (
              <div key={k}>
                <small>{metrics.find((m) => m[1] === k)?.[0]}</small>
                <strong>{number(p[k])}</strong>
              </div>
            ))}
        </div>
        <MatchInventory player={p} />
        {!official && (
          <p className="battle-footnote">
            (Kills + assists) / máximo(1, deaths). No es un MVP oficial ni
            concede recompensas.
          </p>
        )}
      </div>
    </section>
  );
}
export function MatchPositionDuels({
  players,
  catalog,
}: {
  players: BattlePlayer[];
  catalog: HeroCatalogEntry[];
}) {
  const pairs = positionPairs(players);
  if (!pairs.length)
    return (
      <MatchDataState
        title="Enfrentamientos por posición"
        detail="El proveedor no publicó posiciones suficientes para emparejar a los jugadores. El orden de la lista no se interpreta como posición."
      />
    );
  return (
    <section>
      <div className="battle-section-heading">
        <h3>Enfrentamientos por posición</h3>
        <span>
          {players.some((p) => p.playedPosition?.kind === "MODE")
            ? "Regla del modo Solo Mid · Posición 2"
            : "Posiciones publicadas · no roles preferidos"}
        </span>
      </div>
      <div className="battle-duels">
        {pairs.map((pair) => (
          <article key={pair.name}>
            <h4>{pair.name}</h4>
            <div className="battle-duel-players">
              {[pair.radiant, pair.dire].map((p) => (
                <div key={p.key}>
                  <HeroPortrait heroId={p.heroId} catalog={catalog} />
                  <BattleIdentity player={p} />
                  <p>
                    {number(p.kills)} / {number(p.deaths)} / {number(p.assists)}
                  </p>
                  <dl>
                    {(["gpm", "xpm", "netWorth", "heroDamage"] as const)
                      .filter((k) => p[k] != null)
                      .map((k) => (
                        <div key={k}>
                          <dt>{metrics.find((m) => m[1] === k)?.[0]}</dt>
                          <dd>{number(p[k])}</dd>
                        </div>
                      ))}
                  </dl>
                  <MatchInventory player={p} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function MatchTeamComparison({
  players,
  mode,
}: {
  players: BattlePlayer[];
  mode?: string;
}) {
  return (
    <section className="battle-comparison">
      <div className="battle-section-heading">
        <h3>
          {players.length === 2
            ? "Comparacion individual"
            : "Comparación de equipos"}
        </h3>
        <span>Totales de los participantes</span>
      </div>
      {(["netWorth", "heroDamage", "towerDamage", "heroHealing"] as const).map(
        (key) => {
          const a = total(
              players.filter((p) => p.side === "RADIANT"),
              key,
              normalizeRoomMode(mode)
                ? roomFormat(mode!).teamSize
                : mode === "DOTA_GAMEMODE_1V1MID"
                  ? 1
                  : 5,
            ),
            b = total(
              players.filter((p) => p.side === "DIRE"),
              key,
              normalizeRoomMode(mode)
                ? roomFormat(mode!).teamSize
                : mode === "DOTA_GAMEMODE_1V1MID"
                  ? 1
                  : 5,
            );
          if (a == null || b == null) return null;
          return (
            <div key={key} className="battle-comparison-row">
              <span>{number(a)}</span>
              <div>
                <small>{metrics.find((m) => m[1] === key)?.[0]}</small>
                <div className="battle-comparison-bar">
                  <i
                    style={{ width: `${a + b ? (100 * a) / (a + b) : 50}%` }}
                  />
                </div>
              </div>
              <span>{number(b)}</span>
            </div>
          );
        },
      )}
    </section>
  );
}
export function MatchDraft({
  events,
  catalog,
}: {
  events: MatchAnalytics["picksBans"];
  catalog: HeroCatalogEntry[];
}) {
  return events.length ? (
    <section className="battle-draft">
      <div className="battle-section-heading">
        <h3>Draft de Dota 2</h3>
        <span>Orden publicado por el proveedor</span>
      </div>
      <ol>
        {[...events]
          .sort((a, b) => a.order - b.order)
          .map((e, i) => (
            <li key={`${e.order}-${i}`} className={e.isPick ? "" : "is-ban"}>
              <span>
                {e.isPick ? "PICK" : "BAN"} · {e.side ?? "Equipo no disponible"}
              </span>
              <HeroPortrait heroId={e.heroId} catalog={catalog} />
              <b>
                {catalog.find((h) => h.heroId === e.heroId)?.name ??
                  `Héroe ${e.heroId}`}
              </b>
              <small>Orden {e.order}</small>
            </li>
          ))}
      </ol>
    </section>
  ) : (
    <MatchDataState
      title="Draft no disponible"
      detail="No se recibieron picks o bans verificados. No se reconstruye el draft a partir del roster."
    />
  );
}
export function MatchDataState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="battle-data-state" role="status">
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function MatchAbilities({
  players,
  catalog,
}: {
  players: BattlePlayer[];
  catalog: HeroCatalogEntry[];
}) {
  const rows = players.filter((p) => p.abilities?.length);
  return rows.length ? (
    <section className="battle-draft">
      <div className="battle-section-heading">
        <h3>Habilidades y talentos</h3>
        <span>Eventos publicados por STRATZ</span>
      </div>
      {rows.map((p) => (
        <div key={p.key} className="p-4">
          <div className="flex items-center gap-3">
            <HeroPortrait heroId={p.heroId} catalog={catalog} />
            <BattleIdentity player={p} />
          </div>
          <ol className="mt-3">
            {[...p.abilities!]
              .sort((a, b) => a.time - b.time)
              .map((event, i) => (
                <li key={i}>
                  <span>
                    {event.isTalent === true
                      ? "Talento"
                      : event.isTalent === false
                        ? "Habilidad"
                        : "Tipo no disponible"}
                  </span>
                  <b>#{event.abilityId}</b>
                  <small>
                    Nivel {event.level} · {event.time} s
                  </small>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </section>
  ) : (
    <MatchDataState
      title="Habilidades y talentos no disponibles"
      detail="El contrato almacenado no incluye progresión de habilidades. No se deduce a partir del nivel final."
    />
  );
}
export function MatchVision({ players }: { players: BattlePlayer[] }) {
  const rows = players.filter((p) => p.wards?.length);
  return rows.length ? (
    <section className="battle-scoreboard">
      <div className="battle-section-heading">
        <h3>Eventos de visión</h3>
        <span>Tipos crudos STRATZ; sin inferir observer/sentry</span>
      </div>
      {rows.map((p) => (
        <details key={p.key} className="p-4">
          <summary className="cursor-pointer">
            <BattleIdentity player={p} />
            <span className="text-xs">
              {p.wards!.length} eventos publicados
            </span>
          </summary>
          <ol className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
            {p.wards!.map((e, i) => (
              <li key={i}>
                {e.time} s · tipo {e.type}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  ) : (
    <MatchDataState
      title="Datos de visión no disponibles"
      detail="El snapshot no incluye colocación de observer/sentry wards ni eventos de visión."
    />
  );
}
export function MatchBattleDetails(props: BattleProps) {
  const [tab, setTab] = useState("Resumen"),
    id = useId();
  const featured =
    props.source === "DRAFTORY"
      ? props.players.find((p) => p.identity?.id === props.officialMvp)
      : standout(props.players);
  const tabs = [
    "Resumen",
    "Habilidades",
    "Visión",
    "Peleas",
    "Gráficos",
    "Draft",
  ];
  return (
    <div className="match-battle-details">
      <MatchBattleHeader {...props} />
      <div
        className="battle-tabs"
        role="tablist"
        aria-label="Análisis de partida"
      >
        {tabs.map((name, i) => (
          <button
            key={name}
            role="tab"
            id={`${id}-tab-${name}`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const index =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                        tabs.length;
                setTab(tabs[index]);
                (
                  e.currentTarget.parentElement?.children[index] as HTMLElement
                )?.focus();
              }
            }}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="battle-panel"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "Resumen" && (
          <>
            {featured && (
              <MatchFeatured
                player={featured}
                catalog={props.catalog}
                official={props.source === "DRAFTORY"}
              />
            )}
            <MatchPositionDuels
              players={props.players}
              catalog={props.catalog}
            />
            <MatchTeamComparison players={props.players} mode={props.mode} />
            {(["RADIANT", "DIRE"] as const).map((side) => (
              <MatchScoreboard key={side} side={side} {...props} />
            ))}
          </>
        )}
        {tab === "Draft" && (
          <MatchDraft events={props.picksBans} catalog={props.catalog} />
        )}
        {tab === "Habilidades" && (
          <MatchAbilities players={props.players} catalog={props.catalog} />
        )}
        {tab === "Visión" && <MatchVision players={props.players} />}
        {tab === "Peleas" && (
          <MatchDataState
            title="Peleas grupales no disponibles"
            detail="El proveedor no aportó eventos de peleas en esta consulta. No se fabrican participantes, porcentajes ni resultados."
          />
        )}
        {tab === "Gráficos" && (
          <MatchDataState
            title="Timeline de oro y experiencia no disponible"
            detail="La caché no contiene una serie temporal verificada. Los totales finales no permiten dibujar curvas reales."
          />
        )}
      </div>
    </div>
  );
}
