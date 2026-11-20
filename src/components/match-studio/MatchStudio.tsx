"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Crown,
  GitBranch,
  LayoutGrid,
  List,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Eye,
  Clock3,
} from "lucide-react";
import type { HeroCatalogEntry } from "@/lib/dota-stats/types";
import { itemVisual } from "@/lib/dota-stats/items";
import { getHeroRenderUrl } from "@/lib/dota-presentation";
import {
  featuredPlayer,
  participation,
  advantageSummary,
  type StudioMatch,
  type StudioPlayer,
} from "@/lib/match-studio/model";
import { positionNames, total } from "@/lib/dota-stats/match-display";
import { skillAtLevel, filterWards } from "@/lib/match-studio/presentation";
import s from "./MatchStudio.module.css";
import { SkillPopover } from "./SkillPopover";
import { BadgePopover } from "../dashboard/BadgePopover";
import { matchPosition } from "@/lib/dota-stats/match-position";
import { normalizeRoomMode, roomFormat } from "@/lib/rooms/lobby-options.mjs";
import {
  visionCalibration,
  calibratedWardPosition,
  worldWardPosition,
  wardTimeline,
  wardRanges,
} from "@/lib/match-studio/vision-projection";
import { visionGeography } from "@/lib/match-studio/vision-geography";
const n = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v);
const compact = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("es-CO", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v);
const time = (v: number | null | undefined) =>
  v == null
    ? "—"
    : `${v < 0 ? "−" : ""}${Math.floor(Math.abs(v) / 60)}:${String(Math.floor(Math.abs(v) % 60)).padStart(2, "0")}`;
const role = (p: StudioPlayer) =>
  p.position
    ? (positionNames[Number(p.position.slice(-1)) - 1] ??
      "Posición desconocida")
    : "Posición no publicada";
function Asset({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span
        className={`${s.assetFallback} ${className}`}
        title={alt}
        aria-label={alt}
      >
        <Shield size={20} />
      </span>
    );
  // Explicit dimensions are provided by the containing slot. Valve CDN assets bypass optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
function Inventory({
  p,
  hideNeutral = false,
  onlyNeutral = false,
}: {
  p: StudioPlayer;
  hideNeutral?: boolean;
  onlyNeutral?: boolean;
}) {
  return (
    <div
      className={s.inventory}
      aria-label={onlyNeutral ? "Objeto neutral" : "Inventario final"}
    >
      {!onlyNeutral &&
        p.items.map((id, i) => {
          const item = itemVisual(id);
          return (
            <span
              key={i}
              tabIndex={item ? 0 : undefined}
              className={s.itemSlot}
              title={
                item?.name ??
                (id
                  ? `Objeto ${id} · icono no disponible`
                  : id === 0
                    ? "Slot vacío"
                    : "Objeto no publicado")
              }
            >
              <Asset
                src={item?.image}
                alt={
                  item?.name ??
                  (id
                    ? `Objeto ${id}`
                    : id === 0
                      ? "Slot vacío"
                      : "Objeto no publicado")
                }
              />
              <span className={s.tooltip}>
                {item?.name ??
                  (id
                    ? `Objeto ${id}`
                    : id === 0
                      ? "Slot vacío"
                      : "Objeto no publicado")}
              </span>
            </span>
          );
        })}
      {!hideNeutral && (
        <span
          className={s.neutralSlot}
          tabIndex={p.neutralItem ? 0 : undefined}
          title={itemVisual(p.neutralItem)?.name ?? "Neutral no publicado"}
        >
          <Asset
            src={itemVisual(p.neutralItem)?.image}
            alt={itemVisual(p.neutralItem)?.name ?? "Neutral no publicado"}
          />
          <span className={s.tooltip}>
            {itemVisual(p.neutralItem)?.name ?? "Neutral no publicado"}
          </span>
        </span>
      )}
    </div>
  );
}
function HeroStage({
  hero,
  video,
}: {
  hero: HeroCatalogEntry | undefined;
  video: string | null;
}) {
  const box = useRef<HTMLDivElement>(null),
    clip = useRef<HTMLVideoElement>(null);
  const [animate, setAnimate] = useState(false),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      desktop = matchMedia("(min-width: 768px)"),
      connection = (
        navigator as Navigator & { connection?: { saveData?: boolean } }
      ).connection;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const permitted =
          entry.isIntersecting &&
          !motion.matches &&
          desktop.matches &&
          !connection?.saveData;
        setAnimate(permitted);
        if (!permitted) {
          clip.current?.pause();
          setLoaded(false);
        }
      },
      { threshold: 0.15 },
    );
    if (box.current) observer.observe(box.current);
    const update = () => {
      const bounds = box.current?.getBoundingClientRect();
      const visible = !!bounds && bounds.bottom > 0 && bounds.top < innerHeight;
      const permitted =
        visible && !motion.matches && desktop.matches && !connection?.saveData;
      setAnimate(permitted);
      if (!permitted) {
        clip.current?.pause();
        setLoaded(false);
      }
    };
    motion.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (animate) void clip.current?.play().catch(() => setFailed(true));
  }, [animate]);
  return (
    <div ref={box} className={s.heroStage}>
      <span className={s.stageWord} aria-hidden="true">
        MVP
      </span>
      <div className={s.stageOrbit} />
      <div
        className={`${s.stagePortrait} ${loaded && animate && !failed ? s.hidden : ""}`}
      >
        <div className={s.heroPlaceholder} role="status">
          <Crown size={32} />
          <span>{failed ? "Animación no disponible" : "Hero showcase"}</span>
          <small>{hero?.name}</small>
        </div>
      </div>
      {animate && !failed && video && (
        <video
          ref={clip}
          className={s.heroVideo + " " + (loaded ? s.videoReady : "")}
          src={video}
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          onPlaying={() => setLoaded(true)}
          onError={() => setFailed(true)}
          aria-label={`Animación oficial de ${hero?.name}`}
        />
      )}
      <span className={s.stageCaption}>
        DOTA 2 <span>HERO SHOWCASE</span>
      </span>
    </div>
  );
}
const tabs = [
  { id: "summary", label: "Resumen y scoreboard", icon: Swords },
  { id: "skills", label: "Habilidades y talentos", icon: GitBranch },
  { id: "vision", label: "Visión", icon: Eye },
  { id: "fights", label: "Peleas grupales", icon: Target },
  { id: "charts", label: "Gráficos y ventajas", icon: TrendingUp },
] as const;
export function MatchStudio({
  match: m,
  catalog,
  embedded = false,
}: {
  match: StudioMatch;
  catalog: HeroCatalogEntry[];
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<string>("summary"),
    [view, setView] = useState<"cards" | "table">("table"),
    [copied, setCopied] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [compare, setCompare] = useState(false);
  const best =
      m.players.find((p) => p.key === m.draftory?.officialMvp) ??
      featuredPlayer(m.players),
    p = m.players.find((p) => p.key === selected) ?? best,
    hero = catalog.find((h) => h.heroId === p?.heroId),
    team = (side: string) =>
      m.players
        .filter((p) => p.side === side)
        .sort(
          (a, b) =>
            (a.position ?? "Z").localeCompare(b.position ?? "Z") ||
            a.key.localeCompare(b.key),
        );
  const winner =
    m.analytics.radiantWin == null
      ? null
      : m.analytics.radiantWin
        ? "RADIANT"
        : "DIRE";
  const teamSize = normalizeRoomMode(m.analytics.gameMode)
    ? roomFormat(m.analytics.gameMode!).teamSize
    : 5;
  const kills = {
    RADIANT: total(team("RADIANT"), "kills", teamSize),
    DIRE: total(team("DIRE"), "kills", teamSize),
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  const title = (p: StudioPlayer) =>
    p.name ?? (p.accountId ? `Jugador · ${p.accountId}` : "Jugador anónimo");
  return (
    <article
      className={`${s.studio} ${embedded ? s.embedded : ""}`}
      data-match-stats="shared"
      data-source={m.draftory ? "DRAFTORY" : "EXTERNAL"}
    >
      {!embedded && (
        <div className={s.topline}>
          <Link href="/partidas" className={s.back}>
            <ArrowLeft size={16} /> Partidas
          </Link>
          <Link href="/dashboard" className={s.brand}>
            DRAFTORY<span> MATCH INSIGHTS</span>
          </Link>
          <a
            href={`https://stratz.com/matches/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={s.external}
          >
            STRATZ <ArrowUpRight size={15} />
          </a>
        </div>
      )}
      <div
        className={`${s.sourceNotice} ${m.simulated ? s.simulated : ""}`}
        role="status"
      >
        <span className={s.sourceDot} />
        {m.draftory
          ? `DATOS PERSISTIDOS · ${m.analytics.source}`
          : m.simulated
            ? "DEMO SIMULADA · estos valores no representan la partida real"
            : m.status === "STALE"
              ? "Snapshot STRATZ · actualización temporalmente no disponible"
              : `DATOS REALES · ${m.analytics.source}`}
        <span>
          {m.draftory
            ? m.draftory.verified
              ? "Resultado verificado"
              : "Resultado pendiente de verificación"
            : "Partida externa · sin recompensas Draftory"}
        </span>
      </div>
      <header className={s.matchHeader}>
        <TeamHeading
          side="RADIANT"
          players={team("RADIANT")}
          catalog={catalog}
          winner={winner === "RADIANT"}
          name={m.teamNames.RADIANT}
        />
        <div className={s.scoreCenter}>
          <div className={s.matchState}>
            {winner ? "FINALIZADA" : "RESULTADO PENDIENTE"}
          </div>
          <div className={s.score}>
            <strong className={s.green}>{n(kills.RADIANT)}</strong>
            <span>
              <Clock3 size={13} />
              {time(m.analytics.duration)}
            </span>
            <strong className={s.red}>{n(kills.DIRE)}</strong>
          </div>
          <div className={s.mode}>
            {m.draftory
              ? ({
                  ONE_V_ONE_MID: "Solo Mid 1v1",
                  SOLO_MID: "Solo Mid 1v1",
                  ALL_PICK: "All Pick",
                  CAPTAINS_MODE: "Captain's Mode",
                  TURBO: "Turbo",
                }[m.analytics.gameMode ?? ""] ?? m.analytics.gameMode)
              : (m.analytics.gameMode?.replaceAll("_", " ") ??
                "Modo no publicado")}
          </div>
          {m.draftory?.region && (
            <span className={s.muted}>{m.draftory.region}</span>
          )}
          <p>
            {m.analytics.startedAt
              ? new Date(m.analytics.startedAt).toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })
              : "Fecha no publicada"}
          </p>
        </div>
        <TeamHeading
          side="DIRE"
          players={team("DIRE")}
          catalog={catalog}
          winner={winner === "DIRE"}
          name={m.teamNames.DIRE}
        />
        <div className={s.headerFoot}>
          <span>ANÁLISIS DE PARTIDA</span>
          <button onClick={copy} aria-label="Copiar Match ID">
            #{m.id} {copied ? <Check size={13} /> : <Copy size={13} />}
            <span aria-live="polite">{copied ? "Copiado" : ""}</span>
          </button>
        </div>
      </header>
      {p && (
        <section
          className={`${s.spotlight} ${p.side === "DIRE" ? s.direSpotlight : ""}`}
          aria-labelledby="spotlight-title"
        >
          <HeroStage
            key={p.key}
            hero={hero}
            video={p.heroId ? getHeroRenderUrl(p.heroId, catalog) : null}
          />
          <div className={s.spotlightBody}>
            <div className={s.spotlightEyebrow}>
              <span>
                <Crown size={15} />
                {p.key === m.draftory?.officialMvp
                  ? "MVP DRAFTORY"
                  : p === best
                    ? m.draftory
                      ? "RENDIMIENTO DESTACADO"
                      : "MVP EDITORIAL"
                    : "JUGADOR SELECCIONADO"}
              </span>
              <span className={p.side === "RADIANT" ? s.green : s.red}>
                {p.side ?? "Equipo no publicado"}
              </span>
            </div>
            <p className={s.playerName}>
              <PlayerDisplayName id={p.userId ?? undefined} name={title(p)} />
            </p>
            <h1 id="spotlight-title">{hero?.name ?? "Héroe no publicado"}</h1>
            <div className={s.heroContext}>
              <span>{role(p)}</span>
              <span>Nivel {n(p.level)}</span>
              <span>
                Participación{" "}
                {participation(p, m.players) == null
                  ? "—"
                  : `${Math.round(participation(p, m.players)!)}%`}
              </span>
            </div>
            <div className={s.featureKda}>
              <strong>{n(p.kills)}</strong>
              <span>/</span>
              <strong className={s.deaths}>{n(p.deaths)}</strong>
              <span>/</span>
              <strong>{n(p.assists)}</strong>
              <small>K / D / A</small>
            </div>
            <div className={s.metrics}>
              {[
                ["Patrimonio neto", p.netWorth],
                ["Daño a héroes", p.heroDamage],
                ["Daño a estructuras", p.towerDamage],
                ["Oro / min", p.gpm],
                ["XP / min", p.xpm],
                ["Curación", p.heroHealing],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{n(value as number | null)}</strong>
                </div>
              ))}
            </div>
            <div className={s.featureInventory}>
              <span>INVENTARIO FINAL</span>
              <Inventory p={p} />
            </div>
            <p className={s.editorial}>
              {p.key === m.draftory?.officialMvp
                ? "MVP registrado por el sistema de reconocimientos de Draftory."
                : "Selección Draftory por KDA; desempate por daño a héroes. No es un premio oficial del proveedor ni otorga recompensas."}
            </p>
          </div>
        </section>
      )}
      <nav
        className={s.tabs}
        aria-label="Estadísticas de partida"
        role="tablist"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            id={`studio-tab-${id}`}
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`studio-panel-${id}`}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const index = tabs.findIndex((t) => t.id === id),
                  next =
                    tabs[
                      (index + (e.key === "ArrowRight" ? 1 : 4)) % tabs.length
                    ];
                setTab(next.id);
                document.getElementById(`studio-tab-${next.id}`)?.focus();
              }
            }}
          >
            <Icon size={16} />
            {label}
            {id === "fights" && m.fights.length > 0 && (
              <small>{m.fights.length}</small>
            )}
          </button>
        ))}
      </nav>
      <section
        key={tab}
        id={`studio-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`studio-tab-${tab}`}
        className={s.panel}
      >
        {tab === "summary" && (
          <>
            <div className={s.sectionHeading}>
              <div>
                <p>EL CAMPO DE BATALLA</p>
                <h2>
                  {m.players.length === 2
                    ? "Dos héroes. Un duelo."
                    : "Diez héroes. Una historia."}
                </h2>
              </div>
              <div className={s.actions}>
                <button
                  aria-pressed={compare}
                  onClick={() => setCompare(!compare)}
                >
                  {compare ? "Cerrar comparación" : "Comparar jugadores"}
                </button>
                <div className={s.viewToggle}>
                  <button
                    aria-label="Vista tarjetas"
                    aria-pressed={view === "cards"}
                    onClick={() => setView("cards")}
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    aria-label="Vista tabla"
                    aria-pressed={view === "table"}
                    onClick={() => setView("table")}
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
            </div>
            {compare && <Comparison players={m.players} catalog={catalog} />}
            <div className={s.teamBoard}>
              {(["RADIANT", "DIRE"] as const).map((side) => (
                <section
                  key={side}
                  className={side === "RADIANT" ? s.radiantTeam : s.direTeam}
                >
                  <div className={s.teamLabel}>
                    <span>
                      {m.teamNames[side] ?? side}{" "}
                      <small>
                        — OVERVIEW{m.teamNames[side] ? " · " + side : ""}
                      </small>
                    </span>
                    <strong>
                      {winner === side ? "VICTORIA" : winner ? "DERROTA" : "—"}
                    </strong>
                  </div>
                  {view === "cards" ? (
                    <div className={s.playerCards}>
                      {team(side).map((player) => {
                        const h = catalog.find(
                            (h) => h.heroId === player.heroId,
                          ),
                          max = Math.max(
                            ...m.players.map((p) => p.netWorth ?? 0),
                            1,
                          );
                        return (
                          <button
                            key={player.key}
                            className={`${s.playerCard} ${selected === player.key ? s.selectedCard : ""}`}
                            onClick={() => setSelected(player.key)}
                            aria-label={`Ver ${title(player)}, ${h?.name ?? "héroe desconocido"}`}
                          >
                            <div className={s.cardPortrait}>
                              <Asset src={h?.image} alt={h?.name ?? "Héroe"} />
                              <span>{n(player.level)}</span>
                              {best?.key === player.key && (
                                <Crown className={s.cardCrown} size={17} />
                              )}
                            </div>
                            <div className={s.cardInfo}>
                              <small>{role(player)}</small>
                              <strong>{h?.name ?? "Héroe desconocido"}</strong>
                              <span className={s.cardName}>
                                {player.userId && (
                                  <AvatarImage
                                    id={player.userId}
                                    src={player.avatar ?? undefined}
                                    alt={player.name ?? "Jugador"}
                                    size={22}
                                    className="mr-2 inline-block size-[22px] rounded-full object-cover"
                                  />
                                )}
                                <PlayerDisplayName
                                  id={player.userId ?? undefined}
                                  name={title(player)}
                                />
                              </span>
                              <div className={s.cardKda}>
                                {n(player.kills)} <i>/</i>{" "}
                                <em>{n(player.deaths)}</em> <i>/</i>{" "}
                                {n(player.assists)}
                              </div>
                              <div className={s.networth}>
                                <span>
                                  {compact(player.netWorth)} <small>ORO</small>
                                </span>
                                <div>
                                  <i
                                    style={{
                                      width: `${((player.netWorth ?? 0) / max) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <ScoreTable
                      teamSize={teamSize}
                      players={team(side)}
                      catalog={catalog}
                      onSelect={setSelected}
                    />
                  )}
                  <TeamDraft
                    actions={m.analytics.picksBans}
                    side={side}
                    catalog={catalog}
                  />
                </section>
              ))}
            </div>
          </>
        )}
        {tab === "skills" && <Skills players={m.players} catalog={catalog} />}
        {tab === "vision" && <Vision match={m} catalog={catalog} />}
        {tab === "fights" && <Fights match={m} catalog={catalog} />}
        {tab === "charts" && <AdvantageChart match={m} />}
      </section>
      <footer className={s.footer}>
        <span>
          DRAFTORY <small>MATCH INSIGHTS</small>
        </span>
        <p>
          {m.draftory
            ? `Estadísticas persistidas · ${m.analytics.source}`
            : m.simulated
              ? "Escenario visual simulado"
              : `Snapshot ${m.analytics.source}${m.queriedAt ? ` · ${new Date(m.queriedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}` : ""}`}
        </p>
        <details>
          <summary>
            Fuentes y alcance <ChevronDown size={13} />
          </summary>
          <ul>
            {m.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>
            Imágenes y animaciones: recursos públicos de Valve. Dota 2 y sus
            héroes pertenecen a Valve.
          </p>
        </details>
      </footer>
    </article>
  );
}
function TeamHeading({
  side,
  players,
  catalog,
  winner,
  name,
}: {
  side: string;
  players: StudioPlayer[];
  catalog: HeroCatalogEntry[];
  winner: boolean;
  name: string | null;
}) {
  return (
    <div className={`${s.teamHeading} ${side === "DIRE" ? s.direHeading : ""}`}>
      <p>{side}</p>
      <h2>{name ?? side}</h2>
      <span className={winner ? s.winner : s.contender}>
        {winner ? (
          <>
            <Crown size={12} /> VICTORIA
          </>
        ) : (
          "EL EQUIPO"
        )}
      </span>
      <div className={s.heroStrip}>
        {players.map((p) => {
          const h = catalog.find((h) => h.heroId === p.heroId);
          return <Asset key={p.key} src={h?.image} alt={h?.name ?? "Héroe"} />;
        })}
      </div>
    </div>
  );
}
function Empty({
  title,
  copy,
  icon,
}: {
  title: string;
  copy: string;
  icon?: string;
}) {
  return (
    <div className={s.empty}>
      <div>
        {icon === "draft" ? <GitBranch size={30} /> : <Target size={30} />}
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}
function PositionIcon({ player }: { player: StudioPlayer }) {
  const info =
    player.playedPosition ??
    matchPosition({ position: player.position, provider: "el proveedor" });
  return info ? (
    <span className="battle-played-position" data-position-kind={info.kind}>
      <BadgePopover
        kind="tooltip"
        label={`${info.label}. ${info.source}`}
        trigger={<Asset src={info.image} alt="" className={s.positionIcon} />}
      >
        <strong>{info.label}</strong>
        <p>{info.source}</p>
      </BadgePopover>
    </span>
  ) : (
    <span title="Posición no disponible" aria-label="Posición no disponible">
      —
    </span>
  );
}
function ScoreTable({
  players,
  catalog,
  onSelect,
  teamSize = 5,
}: {
  players: StudioPlayer[];
  catalog: HeroCatalogEntry[];
  onSelect: (key: string) => void;
  teamSize?: number;
}) {
  return (
    <div className={s.tableWrap} data-scoreboard>
      <table className={s.scoreTable}>
        <colgroup>
          {[20, 5, 5, 10, 8, 7, 9, 6, 6, 6, 13, 5].map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <caption className={s.srOnly}>
          Overview: rendimiento detallado por jugador
        </caption>
        <thead>
          <tr>
            {[
              "Jugador / héroe",
              "Pos",
              "Nivel",
              "K / D / A",
              "LH / DN",
              "NET",
              "GPM / XPM",
              "HD",
              "TD",
              "HH",
              "Objetos",
              "Neutral",
            ].map((h) => (
              <th
                key={h}
                scope="col"
                title={
                  {
                    NET: "Patrimonio neto",
                    HD: "Daño a héroes",
                    TD: "Daño a estructuras",
                    HH: "Curación",
                  }[h]
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const h = catalog.find((h) => h.heroId === p.heroId);
            return (
              <tr key={p.key}>
                <td data-label="Jugador / héroe">
                  <button
                    onClick={() => onSelect(p.key)}
                    title={p.name ?? "Jugador anónimo"}
                  >
                    <Asset src={h?.image} alt={h?.name ?? "Héroe"} />
                    <span>
                      <strong className="inline-flex items-center gap-2">
                        {p.userId && (
                          <AvatarImage
                            id={p.userId}
                            src={p.avatar ?? undefined}
                            alt={p.name ?? "Jugador"}
                            size={22}
                            className="size-[22px] shrink-0 rounded-full object-cover"
                          />
                        )}
                        <PlayerDisplayName
                          id={p.userId ?? undefined}
                          name={p.name ?? "Jugador anónimo"}
                        />
                      </strong>
                      <small>{h?.name ?? "Héroe desconocido"}</small>
                    </span>
                  </button>
                </td>
                <td data-label="Posición" className={s.positionCell}>
                  <PositionIcon player={p} />
                </td>
                <td data-label="Nivel">{n(p.level)}</td>
                <td data-label="K / D / A" className={s.tableKda}>
                  <span className={s.green}>{n(p.kills)}</span> /{" "}
                  <em>{n(p.deaths)}</em> / {n(p.assists)}
                </td>
                <td data-label="LH / DN">
                  {n(p.lastHits)} / {n(p.denies)}
                </td>
                <td data-label="Net worth" className={s.gold}>
                  {n(p.netWorth)}
                </td>
                <td data-label="GPM / XPM">
                  {n(p.gpm)} / {n(p.xpm)}
                </td>
                <td data-label="Daño héroes" title={n(p.heroDamage)}>
                  {compact(p.heroDamage)}
                </td>
                <td data-label="Daño estructuras" title={n(p.towerDamage)}>
                  {compact(p.towerDamage)}
                </td>
                <td data-label="Curación" title={n(p.heroHealing)}>
                  {compact(p.heroHealing)}
                </td>
                <td data-label="Objetos">
                  <Inventory p={p} hideNeutral />
                </td>
                <td data-label="Neutral">
                  <Inventory p={p} onlyNeutral />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>TOTAL EQUIPO</td>
            <td data-label="K / D / A">
              {n(total(players, "kills", teamSize))} /{" "}
              {n(total(players, "deaths", teamSize))} /{" "}
              {n(total(players, "assists", teamSize))}
            </td>
            <td>
              {n(total(players, "lastHits", teamSize))} /{" "}
              {n(total(players, "denies", teamSize))}
            </td>
            <td>{n(total(players, "netWorth", teamSize))}</td>
            <td title="Las tasas individuales no se suman">—</td>
            <td>{compact(total(players, "heroDamage", teamSize))}</td>
            <td>{compact(total(players, "towerDamage", teamSize))}</td>
            <td>{compact(total(players, "heroHealing", teamSize))}</td>
            <td colSpan={2}>GPM/XPM no sumados</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
function TeamDraft({
  actions,
  side,
  catalog,
}: {
  actions: StudioMatch["analytics"]["picksBans"];
  side: "RADIANT" | "DIRE";
  catalog: HeroCatalogEntry[];
}) {
  const draft = actions.filter((a) => a.side === side);
  if (!draft.length) return null;
  return (
    <div className={s.teamDraft} aria-label={side + " picks y bans publicados"}>
      <span>
        DRAFT{" "}
        <small>
          {draft.some((a) => !a.isPick)
            ? "Selecciones y bans publicados"
            : "Selecciones publicadas"}
        </small>
      </span>
      <div>
        {draft.map((a, i) => {
          const h = catalog.find((h) => h.heroId === a.heroId),
            label =
              (h?.name ?? "Héroe") +
              " · " +
              side +
              " · " +
              (a.isPick ? "Pick" : "Ban") +
              " · Orden " +
              a.order +
              " (índice STRATZ; posición " +
              (a.order + 1) +
              ")";
          return (
            <div
              tabIndex={0}
              title={label}
              aria-label={label}
              key={a.order + "-" + i}
              className={a.isPick ? s.teamPick : s.teamBan}
            >
              <Asset src={h?.image} alt={h?.name ?? "Héroe"} />
              <span>
                {a.isPick ? "PICK" : "BAN"} <b>{a.order + 1}</b>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Skills({
  players,
  catalog,
}: {
  players: StudioPlayer[];
  catalog: HeroCatalogEntry[];
}) {
  const gcUpgrades = players.filter((p) => p.abilityUpgrades?.length);
  if (!players.some((p) => p.learning.length))
    return gcUpgrades.length ? (
      <section>
        <div className={s.sectionHeading}>
          <div>
            <p>HABILIDADES · GC</p>
            <h2>Orden de aprendizaje observado</h2>
          </div>
        </div>
        <p className={s.muted}>
          GC publica identificador y tiempo de mejora; no publica aquí nivel de
          aprendizaje ni clasificación de talento. No se infieren.
        </p>
        {gcUpgrades.map((p) => (
          <article key={p.key} className={s.playerCard}>
            <h3>
              <PlayerDisplayName
                id={p.userId ?? undefined}
                name={p.name ?? "Jugador"}
              />
            </h3>
            <ol>
              {p.abilityUpgrades!.map((e, i) => (
                <li key={i}>
                  #{i + 1} · Habilidad {e.abilityId} · {time(e.time)}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
    ) : (
      <Empty
        title="Habilidades y talentos no disponibles"
        copy="La fuente almacenada no incluye mejoras verificables. No se reconstruyen a partir del nivel final."
      />
    );
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <p>EVOLUCIÓN DE LOS DIEZ HÉROES</p>
          <h2>Habilidades y talentos</h2>
        </div>
        <span>Aprendizaje real · niveles 1–25</span>
      </div>
      <p className={s.muted}>
        Compara cada progresión. Pasa el cursor, enfoca o toca una habilidad
        para consultar su detalle.
      </p>
      {(["RADIANT", "DIRE"] as const).map((side) => (
        <details open key={side} className={s.skillTeam}>
          <summary className={side === "RADIANT" ? s.green : s.red}>
            <span>
              {side} <small>HABILIDADES Y TALENTOS</small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className={s.skillTableScroll}>
            <table className={s.skillTable}>
              <caption className={s.srOnly}>
                {side}, aprendizaje de habilidades por nivel
              </caption>
              <thead>
                <tr>
                  <th scope="col">Jugador / héroe</th>
                  {Array.from({ length: 25 }, (_, i) => (
                    <th key={i} scope="col">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players
                  .filter((p) => p.side === side)
                  .map((p) => {
                    const h = catalog.find((h) => h.heroId === p.heroId);
                    return (
                      <tr key={p.key}>
                        <th scope="row">
                          <div>
                            <Asset src={h?.image} alt={h?.name ?? "Héroe"} />
                            <span>
                              <strong className="inline-flex items-center gap-2">
                                {p.userId && (
                                  <AvatarImage
                                    id={p.userId}
                                    src={p.avatar ?? undefined}
                                    alt={p.name ?? "Jugador"}
                                    size={22}
                                    className="size-[22px] shrink-0 rounded-full object-cover"
                                  />
                                )}
                                <PlayerDisplayName
                                  id={p.userId ?? undefined}
                                  name={p.name ?? "Jugador anónimo"}
                                />
                              </strong>
                              <small>
                                {h?.name ?? "Héroe"} · {role(p)}
                              </small>
                            </span>
                          </div>
                        </th>
                        {Array.from({ length: 25 }, (_, i) => (
                          <td key={i}>
                            {skillAtLevel(p, i + 1).map((e, k) => (
                              <SkillPopover
                                key={k}
                                player={p}
                                event={e}
                                hero={h?.name ?? "Héroe"}
                              />
                            ))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      <div className={s.skillLegend}>
        <span>
          <Asset src="/match-studio/talent-tree.svg" alt="Árbol de talentos" />{" "}
          Talento / atributo
        </span>
        <span>Celda vacía: sin evento publicado para ese nivel</span>
      </div>
    </>
  );
}
function Vision({
  match: m,
  catalog,
}: {
  match: StudioMatch;
  catalog: HeroCatalogEntry[];
}) {
  const players = m.players,
    wards = m.vision?.wards ?? [];
  const [selected, setSelected] = useState(players.map((p) => p.key)),
    [side, setSide] = useState("BOTH"),
    [type, setType] = useState("BOTH"),
    [second, setSecond] = useState(0),
    [allTime, setAllTime] = useState(true),
    [active, setActive] = useState(false),
    [picked, setPicked] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [ranges, setRanges] = useState(false);
  const supported = !m.simulated && m.id === visionCalibration.matchId;
  const min = Math.min(-90, ...wards.map((w) => w.time)),
    max =
      m.analytics.duration ?? Math.max(0, ...wards.map((w) => w.end ?? w.time)),
    current = allTime ? null : second;
  const visible = filterWards(
    wards,
    selected,
    side,
    type,
    current,
    active,
  ).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const chosen = visible.find((w) => w.id === picked),
    name = (key: string) =>
      players.find((p) => p.key === key)?.name ?? "Jugador";
  function toggle(key: string) {
    setSelected((s) =>
      s.includes(key) ? s.filter((k) => k !== key) : [...s, key],
    );
  }
  function choose(id: string, fromMap = false) {
    const w = wards.find((w) => w.id === id);
    if (!w) return;
    setPicked(id);
    if (!allTime) setSecond(w.time);
    if (fromMap)
      requestAnimationFrame(() =>
        document
          .getElementById("ward-row-" + id)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
  }
  const path =
    visionGeography.river
      .map(([x, y], i) => {
        const p = worldWardPosition(x, y)!;
        return (i ? "L" : "M") + p.left + "," + p.top;
      })
      .join(" ") + " Z";
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <p>ANÁLISIS DE VISIÓN</p>
          <h2>La visión del campo de batalla.</h2>
        </div>
        <span>{visible.length} registros filtrados</span>
      </div>
      <div className={s.visionToolbar}>
        <div className={s.filterRow}>
          {[
            ["BOTH", "Ambos"],
            ["RADIANT", "Radiant"],
            ["DIRE", "Dire"],
          ].map(([v, l]) => (
            <button
              key={v}
              aria-pressed={side === v}
              onClick={() => setSide(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className={s.filterRow}>
          {[
            ["BOTH", "Todos"],
            ["OBSERVER", "Observer"],
            ["SENTRY", "Sentry"],
          ].map(([v, l]) => (
            <button
              key={v}
              aria-pressed={type === v}
              onClick={() => setType(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={ranges}
            onChange={(e) => setRanges(e.target.checked)}
          />{" "}
          Alcance teórico
        </label>
        <details className={s.visionPlayerPicker}>
          <summary>
            Jugadores · {selected.length}/{players.length}{" "}
            <ChevronDown size={13} />
          </summary>
          <div className={s.filterControl}>
            <div className={s.filterHeading}>
              <button onClick={() => setSelected(players.map((p) => p.key))}>
                Todos
              </button>
              <button onClick={() => setSelected([])}>Ocultar todos</button>
            </div>
            {players.map((p) => (
              <label key={p.key}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.key)}
                  onChange={() => toggle(p.key)}
                />
                <Asset
                  src={catalog.find((h) => h.heroId === p.heroId)?.image}
                  alt=""
                />
                <span className={p.side === "RADIANT" ? s.green : s.red}>
                  <PlayerDisplayName
                    id={p.userId ?? undefined}
                    name={p.name ?? "Jugador"}
                  />
                </span>
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className={s.visionMain}>
        <div
          className={s.analyticalMap}
          aria-label="Mapa analítico de Dota 2 7.41"
        >
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label="Río, bases y objetivos: coordenadas geográficas 7.41"
          >
            <defs>
              <pattern
                id="vision-grid"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 10 0 L 0 0 0 10"
                  fill="none"
                  stroke="#343c34"
                  strokeWidth=".1"
                />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="#202820" />
            <rect width="100" height="100" fill="url(#vision-grid)" />
            <path d={path} fill="#414b4f" stroke="#657477" strokeWidth=".2" />
            {visionGeography.landmarks.map(([label, x, y]) => {
              const p = worldWardPosition(x, y)!;
              return (
                <g key={label}>
                  <title>{label}</title>
                  <circle
                    cx={p.left}
                    cy={p.top}
                    r={label.startsWith("Ancient") ? 1.1 : 0.65}
                    fill={
                      label.includes("Radiant")
                        ? "#65cda0"
                        : label.includes("Dire")
                          ? "#df827e"
                          : "#c5ab78"
                    }
                  />
                  <text
                    x={p.left}
                    y={p.top - 1.3}
                    textAnchor="middle"
                    fontSize="1.2"
                    fill="#d1d4c7"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            {supported &&
              ranges &&
              visible.map((w) => {
                const p = calibratedWardPosition(w);
                return (
                  p && (
                    <circle
                      key={w.id}
                      cx={p.left}
                      cy={p.top}
                      r={(wardRanges[w.type] / 18322) * 100}
                      fill={w.side === "RADIANT" ? "#65cda00d" : "#df827e0d"}
                      stroke={w.side === "RADIANT" ? "#65cda0" : "#df827e"}
                      strokeWidth=".15"
                      strokeDasharray={
                        w.type === "SENTRY" ? ".6 .5" : undefined
                      }
                    />
                  )
                );
              })}
          </svg>
          {supported ? (
            visible.map((w) => {
              const p = calibratedWardPosition(w);
              return (
                p && (
                  <button
                    key={w.id}
                    data-ward-marker={w.id}
                    aria-label={
                      name(w.playerKey) + " · " + w.type + " · " + time(w.time)
                    }
                    aria-pressed={picked === w.id}
                    title={
                      name(w.playerKey) +
                      " · " +
                      w.type +
                      " · " +
                      time(w.time) +
                      " → " +
                      (w.end === null ? "Fin no disponible" : time(w.end))
                    }
                    className={
                      s.wardMarker +
                      " " +
                      (w.side === "RADIANT" ? s.markerRadiant : s.markerDire) +
                      " " +
                      (w.type === "SENTRY" ? s.markerSentry : "") +
                      " " +
                      (picked === w.id || hovered === w.id
                        ? s.markerHighlight
                        : "")
                    }
                    style={{ left: p.left + "%", top: p.top + "%" }}
                    onClick={() => choose(w.id, true)}
                    onMouseEnter={() => setHovered(w.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(w.id)}
                    onBlur={() => setHovered(null)}
                  >
                    <Asset
                      src={itemVisual(w.type === "OBSERVER" ? 42 : 43)?.image}
                      alt={
                        w.type === "OBSERVER" ? "Observer Ward" : "Sentry Ward"
                      }
                    />
                  </button>
                )
              );
            })
          ) : (
            <div className={s.mapUnavailable}>
              <Eye />
              <strong>Posiciones pendientes de calibración</strong>
              <p>
                Esta cartografía se verificó para la partida de referencia
                7.41f; no se aplica a otra versión por suposición.
              </p>
            </div>
          )}
          <div className={s.mapBadges}>
            <span className={s.green}>
              {visible.filter((w) => w.side === "RADIANT").length} Radiant
            </span>
            <span className={s.red}>
              {visible.filter((w) => w.side === "DIRE").length} Dire
            </span>
          </div>
        </div>
        <div className={s.mapAnalysis}>
          <section className={s.timeControl}>
            <div>
              <h3>Línea temporal</h3>
              <button
                aria-pressed={allTime}
                onClick={() => {
                  setAllTime(true);
                  setActive(false);
                }}
              >
                Toda la partida
              </button>
            </div>
            <strong>{allTime ? "Vista completa" : time(second)}</strong>
            <input
              aria-label="Minuto de visión"
              type="range"
              min={min}
              max={max}
              step="1"
              value={second}
              onChange={(e) => {
                setSecond(Number(e.target.value));
                setAllTime(false);
              }}
            />
            <div className={s.timeLabels}>
              <span>{time(min)}</span>
              <span>{time(max)}</span>
            </div>
            <label>
              <input
                type="checkbox"
                checked={active}
                disabled={allTime}
                onChange={(e) => setActive(e.target.checked)}
              />{" "}
              Solo wards con vida confirmada en ese instante
            </label>
            <p>
              {active
                ? "Solo SPAWN y DESPAWN correlacionados. Fin desconocido: excluido."
                : "Colocaciones históricas hasta ese instante. No equivale a wards activos."}
            </p>
          </section>
          <div className={s.visionLegend}>
            <h3>Leer el mapa</h3>
            <p>
              <Eye size={14} /> Observer · visión
            </p>
            <p>
              <Target size={14} /> Sentry · detección, no visión
            </p>
            <p>
              <span className={s.green}>● Radiant</span>{" "}
              <span className={s.red}>◆ Dire</span>
            </p>
            <small>
              Cartografía analítica 7.41: río, bases y objetivos medidos. No
              representa árboles ni altura. Posición STRATZ cuantizada a celdas
              de 256 unidades.
            </small>
            {ranges && (
              <small>
                Radios geométricos: Observer 1600 u.; Sentry 1050 u. No es
                cobertura efectiva: altura, terreno y obstáculos no
                reconstruidos.
              </small>
            )}
          </div>
          {chosen && (
            <aside className={s.selectedWard} aria-live="polite">
              <strong>
                {name(chosen.playerKey)} ·{" "}
                {chosen.type === "OBSERVER" ? "Observer" : "Sentry"}
              </strong>
              <p>
                Colocado {time(chosen.time)} ·{" "}
                {chosen.end === null
                  ? "Retirada no disponible"
                  : "Retirado " + time(chosen.end)}{" "}
                · Duración{" "}
                {chosen.end === null
                  ? "No disponible"
                  : time(chosen.end - chosen.time)}
                .
              </p>
              <p>
                {chosen.destroyerKey
                  ? "Destruido por " + name(chosen.destroyerKey)
                  : "Sin autor de destrucción confirmado; retirada no implica destrucción."}
              </p>
              <small>
                STRATZ X {chosen.x} · Y {chosen.y}
              </small>
            </aside>
          )}
        </div>
      </div>
      <details className={s.visionDiagnosis}>
        <summary>
          Fuentes y precisión <ChevronDown size={14} />
        </summary>
        <p>
          Geometría 7.41 de gem-dota (MIT), calibración publicada con nueve
          puntos independientes del replay 8974053011. 101/101 colocaciones
          STRATZ compatibles con OpenDota; 97 exactas. X aumenta al este; Y
          aumenta al norte y se invierte en pantalla. El JPEG Valve no se
          redistribuye: este mapa utiliza mediciones geográficas, no una imagen
          decorativa.
        </p>
      </details>
      <div className={s.wardRegister}>
        <div>
          <h3>Cronología de wards</h3>
          <span>Retirada ≠ destrucción sin autor confirmado</span>
        </div>
        <div className={s.wardChronology}>
          <table>
            <thead>
              <tr>
                {[
                  "Ward",
                  "Colocado",
                  "Destruido",
                  "Duración",
                  "Jugador",
                  "Equipo",
                  "Cronología / retirada",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((w) => {
                const bar = wardTimeline(w.time, w.end, min, max)!;
                return (
                  <tr
                    key={w.id}
                    id={"ward-row-" + w.id}
                    data-ward-row={w.id}
                    data-selected={picked === w.id || hovered === w.id}
                    onMouseEnter={() => setHovered(w.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td>
                      <button
                        aria-label={
                          "Seleccionar " +
                          w.type +
                          " de " +
                          name(w.playerKey) +
                          " en " +
                          time(w.time)
                        }
                        onClick={() => choose(w.id)}
                        onFocus={() => setHovered(w.id)}
                        onBlur={() => setHovered(null)}
                      >
                        {w.type === "OBSERVER" ? (
                          <Eye size={16} />
                        ) : (
                          <Target size={16} />
                        )}{" "}
                        {w.type === "OBSERVER" ? "Observer" : "Sentry"}
                      </button>
                    </td>
                    <td>{time(w.time)}</td>
                    <td>{w.destroyerKey ? time(w.end) : "No disponible"}</td>
                    <td>
                      {w.end === null ? "No disponible" : time(w.end - w.time)}
                    </td>
                    <td title={name(w.playerKey)}>{name(w.playerKey)}</td>
                    <td className={w.side === "RADIANT" ? s.green : s.red}>
                      {w.side}
                    </td>
                    <td>
                      <button
                        className={s.wardLife}
                        aria-label={"Ver ubicación de ward en " + time(w.time)}
                        onClick={() => choose(w.id)}
                        title={
                          w.end === null
                            ? "Fin desconocido"
                            : time(w.time) + " → retirada " + time(w.end)
                        }
                      >
                        <span
                          style={{
                            left: bar.left + "%",
                            width:
                              bar.width === null
                                ? "3px"
                                : Math.max(0.3, bar.width) + "%",
                          }}
                          className={
                            w.side === "RADIANT" ? s.lifeRadiant : s.lifeDire
                          }
                        />
                      </button>
                      <small>
                        {w.end === null
                          ? "Retirada no disponible"
                          : time(w.end)}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && (
            <p className={s.muted}>No hay registros para estos filtros.</p>
          )}
        </div>
      </div>
      <div className={s.visionTotals}>
        {(["RADIANT", "DIRE"] as const).map((team) => (
          <div key={team}>
            <span className={team === "RADIANT" ? s.green : s.red}>{team}</span>
            <strong>{visible.filter((w) => w.side === team).length}</strong>
            <small>Colocaciones filtradas</small>
            <p>
              {players
                .filter((p) => p.side === team)
                .some((p) => p.dewards === null)
                ? "No disponible"
                : n(
                    players
                      .filter((p) => p.side === team)
                      .reduce((a, p) => a + (p.dewards ?? 0), 0),
                  )}{" "}
              wards destruidos · total de partida
            </p>
          </div>
        ))}
      </div>
      <div className={s.visionPlayerStats}>
        {players.map((p) => (
          <div key={p.key}>
            <Asset
              src={catalog.find((h) => h.heroId === p.heroId)?.image}
              alt=""
            />
            <strong>
              <PlayerDisplayName
                id={p.userId ?? undefined}
                name={p.name ?? "Jugador"}
              />
            </strong>
            <span>
              {
                wards.filter(
                  (w) => w.playerKey === p.key && w.type === "OBSERVER",
                ).length
              }{" "}
              Observer ·{" "}
              {
                wards.filter(
                  (w) => w.playerKey === p.key && w.type === "SENTRY",
                ).length
              }{" "}
              Sentry
            </span>
            <small>{n(p.dewards)} destruidos</small>
          </div>
        ))}
      </div>
    </>
  );
}
function Fights({
  match: m,
  catalog,
}: {
  match: StudioMatch;
  catalog: HeroCatalogEntry[];
}) {
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <p>MOMENTOS DE LA PARTIDA</p>
          <h2>Cuando todo cambia.</h2>
        </div>
        <span>{m.fights.length} secuencias</span>
      </div>
      <p className={s.muted}>
        Agrupación Draftory de bajas separadas por hasta 20 segundos, calculada
        sobre eventos STRATZ. No equivale a Teamfights oficiales ni acredita
        daño por pelea.
      </p>
      {m.fights.length ? (
        <div className={s.fights}>
          {m.fights.map((f, i) => (
            <details key={i}>
              <summary>
                <span className={s.fightTime}>{time(f.time)}</span>
                <div>
                  <strong>Secuencia {String(i + 1).padStart(2, "0")}</strong>
                  <span>
                    {f.kills} bajas · {f.end - f.time}s entre primer y último
                    evento
                  </span>
                </div>
                <div className={s.fightHeroes}>
                  {f.players.map((key) => {
                    const p = m.players.find((p) => p.key === key),
                      h = catalog.find((h) => h.heroId === p?.heroId);
                    return (
                      <Asset
                        key={key}
                        src={h?.image}
                        alt={h?.name ?? "Héroe"}
                        className={
                          p?.side === "RADIANT" ? s.fightRadiant : s.fightDire
                        }
                      />
                    );
                  })}
                </div>
                <ChevronDown size={18} />
              </summary>
              <div className={s.fightExpanded}>
                <p>
                  {f.label}. Participantes identificables mediante los eventos
                  de bajas; otras asistencias y daño no publicados.
                </p>
                {f.players.map((key) => {
                  const p = m.players.find((p) => p.key === key);
                  return (
                    <span
                      key={key}
                      className={p?.side === "RADIANT" ? s.green : s.red}
                    >
                      {p?.name ?? "Jugador anónimo"}
                    </span>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty
          title="Sin secuencias publicadas"
          copy="No generamos peleas, participantes o daños a partir del marcador final."
        />
      )}
    </>
  );
}
function Comparison({
  players,
  catalog,
}: {
  players: StudioPlayer[];
  catalog: HeroCatalogEntry[];
}) {
  const [a, setA] = useState(players[0]?.key ?? ""),
    [b, setB] = useState(players[5]?.key ?? players[1]?.key ?? ""),
    [category, setCategory] = useState("Combate");
  const left = players.find((p) => p.key === a),
    right = players.find((p) => p.key === b);
  const groups = [
    {
      name: "Combate",
      fields: [
        ["kills", "Asesinatos"],
        ["deaths", "Muertes"],
        ["assists", "Asistencias"],
        ["participation", "Participación en bajas"],
        ["heroDamage", "Daño a héroes"],
      ],
    },
    {
      name: "Economía",
      fields: [
        ["netWorth", "Patrimonio"],
        ["gpm", "GPM"],
        ["xpm", "XPM"],
        ["lastHits", "Last hits"],
        ["denies", "Denies"],
      ],
    },
    {
      name: "Objetivos y apoyo",
      fields: [
        ["towerDamage", "Daño a estructuras"],
        ["heroHealing", "Curación"],
      ],
    },
  ];
  const value = (p: StudioPlayer, field: string) =>
    field === "participation"
      ? participation(p, players)
      : p[
          field as
            | "kills"
            | "deaths"
            | "assists"
            | "heroDamage"
            | "netWorth"
            | "gpm"
            | "xpm"
            | "lastHits"
            | "denies"
            | "towerDamage"
            | "heroHealing"
        ];
  const profile = (
    p: StudioPlayer | undefined,
    v: string,
    set: (v: string) => void,
    other: string,
    i: number,
  ) => {
    const h = catalog.find((h) => h.heroId === p?.heroId);
    return (
      <div className={s.duelProfile} data-player={i}>
        <Asset src={h?.image} alt={h?.name ?? "Héroe"} />
        <span className={p?.side === "RADIANT" ? s.green : s.red}>
          {p?.side ?? "—"} · {p ? role(p) : "—"}
        </span>
        <strong>{p?.name ?? "Jugador anónimo"}</strong>
        <small>{h?.name ?? "Héroe"}</small>
        <div className={s.duelKda}>
          {n(p?.kills)} <em>/ {n(p?.deaths)} /</em> {n(p?.assists)}
          <small>K / D / A</small>
        </div>
        <label>
          <span className={s.srOnly}>Jugador {i}</span>
          <select
            aria-label={"Cambiar jugador " + i}
            value={v}
            onChange={(e) => set(e.target.value)}
          >
            {players.map((p) => (
              <option key={p.key} value={p.key} disabled={p.key === other}>
                <PlayerDisplayName
                  id={p.userId ?? undefined}
                  name={p.name ?? "Jugador"}
                />{" "}
                · {catalog.find((h) => h.heroId === p.heroId)?.name ?? "Héroe"}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };
  return (
    <section className={s.comparison} aria-label="Comparación de jugadores">
      <div className={s.duelLayout}>
        {profile(left, a, setA, b, 1)}
        <div className={s.duelAnalysis}>
          <div className={s.duelTitle}>
            <span>COMPARACIÓN</span>
            <b>VS</b>
          </div>
          <div className={s.duelCategory} aria-label="Categoría de comparación">
            {groups.map((g) => (
              <button
                key={g.name}
                aria-pressed={category === g.name}
                onClick={() => setCategory(g.name)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className={s.duelGroups}>
            {left &&
              right &&
              groups.map((g) => (
                <section
                  key={g.name}
                  className={s.duelGroup}
                  data-active={category === g.name}
                >
                  <h3>{g.name}</h3>
                  {g.fields.map(([field, label]) => {
                    const av = value(left, field),
                      bv = value(right, field),
                      sum = (av ?? 0) + (bv ?? 0),
                      known = av != null && bv != null,
                      width = known && sum ? (av! / sum) * 100 : 50;
                    const fmt = (v: number | null) =>
                      field === "participation" && v != null
                        ? n(v) + "%"
                        : n(v);
                    return (
                      <div
                        className={s.duelStat}
                        key={field}
                        data-metric={field}
                      >
                        <span>{label}</span>
                        <div>
                          <strong data-higher={known && av! > bv!}>
                            {fmt(av)}
                          </strong>
                          <i aria-hidden="true" data-known={known}>
                            <b style={{ width: width + "%" }} />
                            <em style={{ width: 100 - width + "%" }} />
                          </i>
                          <strong data-higher={known && bv! > av!}>
                            {fmt(bv)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
          </div>
          <p className={s.duelNote}>
            Verde: jugador A · rojo: jugador B. Barras de magnitud, no
            puntuaciones. Más muertes no es mejor rendimiento.
          </p>
        </div>
        {profile(right, b, setB, a, 2)}
      </div>
    </section>
  );
}
function AdvantageChart({ match: m }: { match: StudioMatch }) {
  const [metric, setMetric] = useState<"gold" | "xp" | "both">("both"),
    [index, setIndex] = useState(0),
    [hover, setHover] = useState(false),
    [tooltipLeft, setTooltipLeft] = useState(12),
    points = m.timeline,
    summary = advantageSummary(points, metric === "xp" ? "xp" : "gold");
  if (!points.length)
    return (
      <Empty
        title="Sin historial de ventajas"
        copy="El resultado final no permite reconstruir una curva de oro o experiencia."
      />
    );
  const maximum = Math.max(
      1000,
      ...points.flatMap((p) => [
        metric !== "xp" ? Math.abs(p.gold ?? 0) : 0,
        metric !== "gold" ? Math.abs(p.xp ?? 0) : 0,
      ]),
    ),
    x = (i: number) => 60 + (i / Math.max(1, points.length - 1)) * 920,
    y = (v: number) => 160 - (v / maximum) * 120;
  const path = (field: "gold" | "xp") => {
    let open = false;
    return points
      .map((p, i) => {
        if (p[field] == null) {
          open = false;
          return "";
        }
        const command = open ? "L" : "M";
        open = true;
        return `${command}${x(i)},${y(p[field]!)}`;
      })
      .join(" ");
  };
  const point = points[Math.min(index, points.length - 1)],
    lead = metric === "xp" ? point.xp : point.gold;
  const peak = points.reduce<{ minute: number; value: number } | null>(
    (best, p) => {
      const v = metric === "xp" ? p.xp : p.gold;
      return v !== null && (!best || Math.abs(v) > Math.abs(best.value))
        ? { minute: p.minute, value: v }
        : best;
    },
    null,
  );
  const explore = (e: PointerEvent<SVGSVGElement>) => {
    setHover(true);
    const host = e.currentTarget.parentElement!,
      hostRect = host.getBoundingClientRect();
    setTooltipLeft(
      Math.max(
        8,
        Math.min(host.clientWidth - 244, e.clientX - hostRect.left + 16),
      ),
    );
    const bounds = e.currentTarget.getBoundingClientRect(),
      px = ((e.clientX - bounds.left) / bounds.width) * 1040;
    setIndex(
      Math.min(
        points.length - 1,
        Math.max(0, Math.round(((px - 60) / 920) * (points.length - 1))),
      ),
    );
  };
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <p>LECTURA DE LA PARTIDA</p>
          <h2>La ventaja, a lo largo del juego.</h2>
        </div>
        <TrendingUp size={24} />
      </div>
      <div className={s.chartSummary}>
        {[
          ["Máxima Radiant", summary.radiant],
          ["Máxima Dire", summary.dire == null ? null : Math.abs(summary.dire)],
          ["Cambios de liderazgo", summary.changes],
          ["Última muestra", summary.final],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>{n(value as number | null)}</strong>
          </div>
        ))}
      </div>
      <div className={s.chartBox}>
        <div className={s.chartHeading}>
          <div>
            <h3>Ventaja de oro y experiencia</h3>
            <p>Sobre cero: Radiant. Bajo cero: Dire.</p>
          </div>
          <div className={s.viewToggle}>
            {(["gold", "xp", "both"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={metric === v}
                onClick={() => setMetric(v)}
              >
                {{ gold: "Oro", xp: "XP", both: "Ambos" }[v]}
              </button>
            ))}
          </div>
        </div>
        <div className={s.chartLegend}>
          {metric !== "xp" && (
            <span>
              <i className={s.goldDot} /> Oro
            </span>
          )}
          {metric !== "gold" && (
            <span>
              <i className={s.xpDot} /> Experiencia · línea discontinua
            </span>
          )}
        </div>
        <div
          className={s.chartCanvas}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setHover(false);
          }}
        >
          <div className={s.chartPlot}>
            <svg
              viewBox="0 0 1040 340"
              role="img"
              aria-label="Gráfica de ventaja Radiant frente a Dire"
              onPointerMove={explore}
              onPointerDown={explore}
            >
              {[-1, -0.5, 0, 0.5, 1].map((v) => (
                <g key={v}>
                  <line
                    x1="60"
                    x2="980"
                    y1={y(v * maximum)}
                    y2={y(v * maximum)}
                    stroke={v === 0 ? "#555047" : "#29282d"}
                    strokeDasharray={v === 0 ? undefined : "3 5"}
                  />
                  <text
                    x="47"
                    y={y(v * maximum) + 4}
                    textAnchor="end"
                    fill={v > 0 ? "#8dcaab" : v < 0 ? "#cf858b" : "#a9a6ac"}
                    fontSize="11"
                  >
                    {v > 0 ? "+" : ""}
                    {compact(v * maximum)}
                  </text>
                </g>
              ))}
              {metric !== "xp" && (
                <path
                  d={path("gold")}
                  fill="none"
                  stroke="#e1b66a"
                  strokeWidth="2.7"
                  strokeLinejoin="round"
                />
              )}
              {metric !== "gold" && (
                <path
                  d={path("xp")}
                  fill="none"
                  stroke="#b29bdb"
                  strokeWidth="2.4"
                  strokeDasharray="5 4"
                />
              )}
              <line
                x1={x(index)}
                x2={x(index)}
                y1="30"
                y2="280"
                stroke="#ddd"
                strokeDasharray="3 4"
              />
              {(["gold", "xp"] as const).map(
                (field) =>
                  (metric === "both" || metric === field) &&
                  point[field] != null && (
                    <circle
                      key={field}
                      cx={x(index)}
                      cy={y(point[field]!)}
                      r="5"
                      fill={field === "gold" ? "#e1b66a" : "#b29bdb"}
                      stroke="#141316"
                      strokeWidth="2"
                    />
                  ),
              )}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <text
                  key={t}
                  x={60 + t * 920}
                  y="313"
                  textAnchor="middle"
                  fill="#98949f"
                  fontSize="12"
                >
                  {m.timelineCadenceVerified
                    ? `${Math.round(t * (points.length - 1))}:00`
                    : `#${Math.round(t * (points.length - 1)) + 1}`}
                </text>
              ))}
            </svg>
          </div>
          <div
            className={s.chartTooltip}
            hidden={!hover}
            style={{ left: tooltipLeft }}
          >
            <strong>
              {m.timelineCadenceVerified
                ? `Minuto ${point.minute}:00`
                : `Muestra ${index + 1}`}
              <span
                className={lead == null ? s.muted : lead >= 0 ? s.green : s.red}
              >
                {lead == null
                  ? "—"
                  : lead === 0
                    ? "Igualados"
                    : lead > 0
                      ? metric === "both"
                        ? "Radiant lidera en oro"
                        : "Radiant lidera"
                      : metric === "both"
                        ? "Dire lidera en oro"
                        : "Dire lidera"}
              </span>
            </strong>
            <p>
              <i className={s.goldDot} />
              Oro <b>{n(point.gold)}</b>
            </p>
            <p>
              <i className={s.xpDot} />
              Experiencia <b>{n(point.xp)}</b>
            </p>
          </div>
        </div>
        <label className={s.chartSlider}>
          Explorar {m.timelineCadenceVerified ? "minuto" : "muestra"}
          <input
            aria-label="Explorar puntos de ventaja"
            type="range"
            min="0"
            max={points.length - 1}
            value={index}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setHover(true);
              setTooltipLeft(12);
            }}
          />
          <output>
            {m.timelineCadenceVerified
              ? `${point.minute}:00`
              : `${index + 1} / ${points.length}`}
          </output>
        </label>
        <p className={s.chartPeak}>
          {peak
            ? "Máxima diferencia " +
              (metric === "xp" ? "de XP" : "de oro") +
              ": " +
              n(Math.abs(peak.value)) +
              " · " +
              (m.timelineCadenceVerified
                ? "minuto " + peak.minute + ":00"
                : "muestra " + (peak.minute + 1))
            : null}
        </p>
        <p className={s.chartNote}>
          {m.simulated
            ? "Serie temporal simulada para demostrar las interacciones."
            : m.timelineCadenceVerified
              ? "Minutos de oro contrastados con playback. XP conserva las muestras paralelas de STRATZ."
              : "Series reales STRATZ. La fuente no acreditó aquí el origen temporal exacto; se muestran muestras ordenadas, sin inventar minutos."}
        </p>
      </div>
    </>
  );
}
