import {
  normalizeStratzMatch,
  type MatchAnalytics,
  type AnalyticsPlayer,
} from "../dota-stats/match-analytics";
import { kda } from "../dota-stats/match-display";
import { normalizeWards, type WardRecord } from "./presentation";
export type StudioTalent = {
  abilityId: number;
  slot: number;
  name: string | null;
};
export type StudioPlayer = AnalyticsPlayer & {
  /** Draftory identity only; never an external Dota account ID. */
  userId?: string;
  avatar?: string;
  playedPosition?: import("../dota-stats/match-position").PlayedPosition;
  key: string;
  name: string | null;
  learning: {
    abilityId: number;
    level: number | null;
    time: number;
    talent: boolean;
  }[];
  abilityMeta: { id: number; name: string; image: string | null }[];
  talents?: StudioTalent[];
  wardEvents: {
    time: number;
    type: number;
    x: number | null;
    y: number | null;
  }[];
  dewards: number | null;
};
export type StudioMatch = {
  draftory?: {
    region?: string;
    verified: boolean;
    officialMvp?: string | null;
  };
  id: string;
  simulated: boolean;
  status: string;
  queriedAt: string;
  analytics: MatchAnalytics;
  players: StudioPlayer[];
  teamNames: { RADIANT: string | null; DIRE: string | null };
  timeline: { minute: number; gold: number | null; xp: number | null }[];
  timelineCadenceVerified: boolean;
  vision?: { wards: WardRecord[]; projectionVerified: boolean };
  fights: {
    time: number;
    end: number;
    players: string[];
    kills: number;
    label: string;
  }[];
  warnings: string[];
};
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.slice(0, 120) : null;
export function verifiedTimelineOffset(
  rawPlayers: unknown[],
  gold: unknown[],
  xp: unknown[],
) {
  // A matching vector alone is insufficient: independently check timestamped playback.
  if (rawPlayers.length !== 10 || gold.length < 3 || gold.length !== xp.length)
    return null;
  for (let i = 1; i < gold.length; i++) {
    let byMinute = 0,
      byPlayback = 0;
    for (const value of rawPlayers) {
      const p = rec(value),
        stats = rec(p.stats),
        playback = rec(p.playbackData);
      if (
        typeof p.isRadiant !== "boolean" ||
        !Array.isArray(stats.networthPerMinute) ||
        !Array.isArray(playback.playerUpdateGoldEvents)
      )
        return null;
      const nw = finite(stats.networthPerMinute[i - 1]);
      const event = playback.playerUpdateGoldEvents
        .map(rec)
        .filter(
          (e) => finite(e.time) !== null && Number(e.time) <= (i - 1) * 60,
        )
        .sort((a, b) => Number(a.time) - Number(b.time))
        .at(-1);
      const timed = finite(event?.networth);
      if (nw === null || timed === null) return null;
      const sign = p.isRadiant ? 1 : -1;
      byMinute += sign * nw;
      byPlayback += sign * timed;
    }
    if (
      finite(gold[i]) === null ||
      gold[i] !== byMinute ||
      gold[i] !== byPlayback
    )
      return null;
  }
  return 1;
}
export function normalizeStudio(
  raw: unknown,
  id: string,
  talentNames: Record<string, string> = {},
): StudioMatch {
  const root = rec(raw),
    m = rec(rec(root.data).match);
  if (!Array.isArray(m.players)) throw Error("INVALID_RESPONSE");
  // Keep the established normalizer strict. Invalid legacy ability levels must not poison valid base stats.
  const base = normalizeStratzMatch(
    {
      data: {
        match: {
          ...m,
          players: m.players.map((v) => ({
            ...rec(v),
            abilities: undefined,
            stats: undefined,
          })),
        },
      },
      errors: root.errors,
    },
    id,
  );
  const players = base.players.map((p, i) => {
    const r = rec((m.players as unknown[])[i]),
      stats = rec(r.stats),
      playback = rec(r.playbackData);
    const learning = (
      Array.isArray(playback.abilityLearnEvents)
        ? playback.abilityLearnEvents
        : []
    )
      .flatMap((v) => {
        const e = rec(v);
        return typeof e.abilityId === "number" &&
          Number.isSafeInteger(e.abilityId) &&
          e.abilityId > 0 &&
          finite(e.time) !== null
          ? [
              {
                abilityId: e.abilityId,
                time: Number(e.time),
                level:
                  typeof e.levelObtained === "number" && e.levelObtained > 0
                    ? e.levelObtained
                    : null,
                talent: e.isTalent === true,
              },
            ]
          : [];
      })
      .slice(0, 100)
      .sort((a, b) => a.time - b.time);
    const abilityMeta = (Array.isArray(r.abilities) ? r.abilities : []).flatMap(
      (v) => {
        const e = rec(v),
          a = rec(e.abilityType);
        const internal = text(a.name);
        return typeof e.abilityId === "number" && e.abilityId > 0
          ? [
              {
                id: e.abilityId,
                name:
                  text(rec(a.language).displayName) ??
                  text(a.name) ??
                  `Habilidad ${e.abilityId}`,
                image:
                  internal && /^[a-z0-9_]+$/.test(internal)
                    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${internal}.png`
                    : null,
              },
            ]
          : [];
      },
    );
    const wardEvents = (Array.isArray(stats.wards) ? stats.wards : [])
      .flatMap((v) => {
        const e = rec(v);
        return finite(e.time) !== null && finite(e.type) !== null
          ? [
              {
                time: Number(e.time),
                type: Number(e.type),
                x: finite(e.positionX),
                y: finite(e.positionY),
              },
            ]
          : [];
      })
      .slice(0, 1000);
    const hero = rec(r.hero);
    // Reject a catalogue from another patch. Missing slots remain unknown, never filled by order.
    const talents: StudioTalent[] =
      Number.isSafeInteger(m.gameVersionId) &&
      hero.gameVersionId === m.gameVersionId &&
      Array.isArray(hero.talents)
        ? hero.talents.flatMap((v) => {
            const t = rec(v);
            return Number.isSafeInteger(t.abilityId) &&
              Number(t.abilityId) > 0 &&
              Number.isInteger(t.slot) &&
              Number(t.slot) >= 0 &&
              Number(t.slot) < 8
              ? [
                  {
                    abilityId: Number(t.abilityId),
                    slot: Number(t.slot),
                    name:
                      text(talentNames[String(t.abilityId)]) ??
                      abilityMeta.find((a) => a.id === t.abilityId)?.name ??
                      null,
                  },
                ]
              : [];
          })
        : [];
    return {
      ...p,
      key: `${p.side}:${p.slot}:${i}`,
      name: text(rec(r.steamAccount).name),
      learning,
      abilityMeta,
      talents,
      wardEvents,
      dewards: Array.isArray(stats.wardDestruction)
        ? stats.wardDestruction.filter((v) => rec(v).isWard === true).length
        : null,
    };
  });
  // Minute arrays are not assigned an invented offset. Verify against timestamped net-worth playback first.
  const gold = Array.isArray(m.radiantNetworthLeads)
      ? m.radiantNetworthLeads
      : [],
    xp = Array.isArray(m.radiantExperienceLeads)
      ? m.radiantExperienceLeads
      : [];
  const offset = verifiedTimelineOffset(m.players, gold, xp);
  const kills = m.players
    .flatMap((v, i) => {
      const stats = rec(rec(v).stats);
      return (Array.isArray(stats.killEvents) ? stats.killEvents : []).flatMap(
        (v) => {
          const e = rec(v);
          if (finite(e.time) === null) return [];
          return [{ time: Number(e.time), participants: [players[i].key] }];
        },
      );
    })
    .sort((a, b) => a.time - b.time);
  const clusters: (typeof kills)[] = [];
  for (const event of kills) {
    const last = clusters.at(-1);
    if (last && event.time - last.at(-1)!.time <= 20) last.push(event);
    else clusters.push([event]);
  }
  const fights = clusters
    .filter((c) => c.length >= 3)
    .map((c) => ({
      time: c[0].time,
      end: c.at(-1)!.time,
      players: [...new Set(c.flatMap((k) => k.participants))],
      kills: c.length,
      label: "Secuencia de bajas · agrupación Draftory",
    }));
  return {
    vision: {
      wards: normalizeWards(rec(m.playbackData).wardEvents, players),
      projectionVerified: false,
    },
    id,
    simulated: false,
    status: "AVAILABLE",
    queriedAt: new Date().toISOString(),
    analytics: base,
    players,
    teamNames: {
      RADIANT: text(rec(m.radiantTeam).name),
      DIRE: text(rec(m.direTeam).name),
    },
    timeline: Array.from(
      { length: Math.max(gold.length, xp.length) - (offset ?? 0) },
      (_, i) => ({
        minute: i,
        gold: finite(gold[i + (offset ?? 0)]),
        xp: finite(xp[i + (offset ?? 0)]),
      }),
    ),
    timelineCadenceVerified: offset !== null,
    fights,
    warnings: [
      "La selección destacada es editorial de Draftory, no un premio STRATZ.",
      offset === null
        ? "Las series conservan el orden original; el origen temporal no está certificado."
        : "Minutos de oro contrastados con patrimonio por minuto y playback timestamped de los diez jugadores. XP conserva el índice paralelo STRATZ; la muestra prepartida se omite.",
      "Las secuencias agrupan bajas separadas por hasta 20 segundos: no son Teamfights oficiales. Los tipos y ciclos de wards están correlacionados; la proyección sobre el mapa no está certificada.",
    ],
  };
}
export function featuredPlayer(players: StudioPlayer[]) {
  return (
    [...players]
      .filter((p) => kda(p) !== null)
      .sort(
        (a, b) =>
          kda(b)! - kda(a)! ||
          (b.heroDamage ?? 0) - (a.heroDamage ?? 0) ||
          a.key.localeCompare(b.key),
      )[0] ?? null
  );
}
export function participation(p: StudioPlayer, players: StudioPlayer[]) {
  const team = players.filter((x) => x.side === p.side);
  if (
    !p.side ||
    team.length !== 5 ||
    p.kills == null ||
    p.assists == null ||
    team.some((x) => x.kills == null)
  )
    return null;
  const total = team.reduce((n, x) => n + x.kills!, 0);
  return total > 0 ? ((p.kills + p.assists) / total) * 100 : null;
}
export function advantageSummary(
  points: StudioMatch["timeline"],
  metric: "gold" | "xp",
) {
  const values = points
    .map((p) => p[metric])
    .filter((n): n is number => n !== null);
  let changes = 0,
    last = 0;
  for (const n of values) {
    const sign = Math.sign(n);
    if (sign && last && sign !== last) changes++;
    if (sign) last = sign;
  }
  return {
    radiant: values.length ? Math.max(0, ...values) : null,
    dire: values.length ? Math.min(0, ...values) : null,
    changes: values.length ? changes : null,
    final: points.at(-1)?.[metric] ?? null,
  };
}
export function simulatedStudio(id: string): StudioMatch {
  const heroes = [46, 35, 15, 19, 131, 53, 36, 108, 88, 26];
  const players: StudioPlayer[] = heroes.map((heroId, i) => ({
    key: `fixture-${i}`,
    name: `Jugador ${i + 1} · demo`,
    accountId: null,
    side: i < 5 ? "RADIANT" : "DIRE",
    slot: i % 5,
    heroId,
    kills: 2 + ((i * 7) % 17),
    deaths: 2 + (i % 9),
    assists: 4 + ((i * 3) % 18),
    level: 18 + (i % 9),
    lastHits: 100 + i * 31,
    denies: i * 2,
    gpm: 320 + i * 43,
    xpm: 430 + i * 49,
    netWorth: 12000 + i * 1900,
    heroDamage: 15000 + i * 4100,
    towerDamage: 1000 + i * 900,
    heroHealing: i % 3 === 0 ? 1800 : 0,
    items: [1, 116, 50, 100, null, null],
    neutralItem: null,
    position: `POSITION_${(i % 5) + 1}`,
    learning: [],
    abilityMeta: [],
    wardEvents: [],
    dewards: null,
  }));
  const timeline = Array.from({ length: 40 }, (_, i) => ({
    minute: i,
    gold: Math.round(Math.sin(i / 4) * 2100 + i * i * 10 - 2200),
    xp: Math.round(Math.sin(i / 5) * 3300 + i * i * 15 - 2500),
  }));
  return {
    id,
    simulated: true,
    status: "SIMULATED",
    queriedAt: "",
    players,
    analytics: {
      source: "STRATZ",
      contractVersion: 2,
      externalMatchId: id,
      startedAt: null,
      endedAt: null,
      gameMode: "ALL_PICK",
      duration: 2351,
      radiantWin: true,
      players,
      picksBans: [],
      timeline: [],
      provenance: {},
      conflicts: [],
    },
    teamNames: { RADIANT: null, DIRE: null },
    timeline,
    timelineCadenceVerified: true,
    fights: [],
    warnings: [
      "DEMO SIMULADA: todos los valores de este escenario son ficticios y no describen la partida solicitada.",
    ],
  };
}
