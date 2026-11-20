// Provider-independent DTO. IDs remain strings; absent values never become zero.
export type AnalyticsSource = "GC" | "STRATZ" | "OPENDOTA" | "VALVE";
export type AnalyticsPlayer = {
  abilityUpgrades?: { abilityId: number; time: number }[];
  abilities?: {
    abilityId: number;
    time: number;
    level: number;
    isTalent: boolean | null;
  }[];
  wards?: { time: number; type: number }[];
  accountId: string | null;
  side: "RADIANT" | "DIRE" | null;
  slot: number | null;
  heroId: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  level: number | null;
  lastHits: number | null;
  denies: number | null;
  gpm: number | null;
  xpm: number | null;
  netWorth: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  items: (number | null)[];
  neutralItem: number | null;
  position: string | null;
};
export type MatchAnalytics = {
  source: AnalyticsSource;
  contractVersion: 2;
  externalMatchId: string;
  startedAt?: string | null;
  endedAt?: string | null;
  gameMode?: string | null;
  duration: number | null;
  radiantWin: boolean | null;
  players: AnalyticsPlayer[];
  picksBans: {
    heroId: number;
    isPick: boolean;
    side: "RADIANT" | "DIRE" | null;
    order: number;
  }[];
  timeline: {
    minute: number;
    goldAdvantage: number | null;
    xpAdvantage: number | null;
  }[];
  provenance: Record<string, AnalyticsSource>;
  conflicts: string[];
  obtainedAt?: string;
  reconciliation?: {
    attempts: number;
    checkedAt: string;
    exhausted: boolean;
    providers: { source: AnalyticsSource; status: string }[];
  };
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("INVALID_RESPONSE");
  return v as Record<string, unknown>;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function id(v: unknown): string | null {
  const s =
    typeof v === "number" && Number.isSafeInteger(v)
      ? String(v)
      : typeof v === "string"
        ? v
        : "";
  return /^[1-9]\d{0,19}$/.test(s) ? s : null;
}
function account(v: unknown) {
  const s = id(v);
  return s && BigInt(s) < BigInt("4294967295") ? s : null;
}
function timestamp(v: unknown) {
  const n = num(v);
  return n && n < 253402300800 ? new Date(n * 1000).toISOString() : null;
}
export function annotate(a: MatchAnalytics, source: AnalyticsSource) {
  for (const key of ["duration", "radiantWin"] as const)
    if (a[key] !== null) a.provenance[key] = source;
  for (const key of ["startedAt", "endedAt", "gameMode"] as const)
    if (a[key] != null) a.provenance[key] = source;
  for (const p of a.players)
    for (const [k, v] of Object.entries(p))
      if (k === "items") {
        p.items.forEach((item, i) => {
          if (item !== null)
            a.provenance[
              `players.${p.accountId ?? `${p.side}:${p.slot}`}.items.${i}`
            ] = source;
        });
      } else if (v !== null)
        a.provenance[`players.${p.accountId ?? `${p.side}:${p.slot}`}.${k}`] =
          source;
  if (a.picksBans.length) a.provenance.picksBans = source;
  if (a.timeline.length) a.provenance.timeline = source;
  return a;
}
export function normalizeStratzMatch(
  raw: unknown,
  expected: string,
): MatchAnalytics {
  const root = object(raw);
  if (Array.isArray(root.errors) && root.errors.length)
    throw Error("API_ERROR");
  const m = object(object(root.data).match);
  if (
    id(m.id) !== expected ||
    !Array.isArray(m.players) ||
    m.players.length > 10
  )
    throw Error("INVALID_RESPONSE");
  const players = m.players.map((v) => {
    const p = object(v);
    return {
      accountId: account(p.steamAccountId),
      side:
        typeof p.isRadiant === "boolean"
          ? p.isRadiant
            ? "RADIANT"
            : "DIRE"
          : null,
      slot: num(p.playerSlot),
      heroId: num(p.heroId) || null,
      kills: num(p.kills),
      deaths: num(p.deaths),
      assists: num(p.assists),
      level: num(p.level),
      lastHits: num(p.numLastHits),
      denies: num(p.numDenies),
      gpm: num(p.goldPerMinute),
      xpm: num(p.experiencePerMinute),
      netWorth: num(p.networth),
      heroDamage: num(p.heroDamage),
      towerDamage: num(p.towerDamage),
      heroHealing: num(p.heroHealing),
      items: Array.from({ length: 6 }, (_, i) => num(p[`item${i}Id`])),
      neutralItem: num(p.neutral0Id),
      position:
        typeof p.position === "string" && /^POSITION_[1-5]$/.test(p.position)
          ? p.position
          : null,
    } as AnalyticsPlayer;
  });
  for (let i = 0; i < players.length; i++) {
    const p = object(m.players[i]);
    if (p.abilities != null) {
      if (!Array.isArray(p.abilities) || p.abilities.length > 100)
        throw Error("INVALID_RESPONSE");
      players[i].abilities = p.abilities.map((v) => {
        const e = object(v);
        if (
          !num(e.abilityId) ||
          !num(e.level) ||
          !Number.isSafeInteger(e.time) ||
          Math.abs(e.time as number) > 86400
        )
          throw Error("INVALID_RESPONSE");
        return {
          abilityId: e.abilityId as number,
          time: e.time as number,
          level: e.level as number,
          isTalent: typeof e.isTalent === "boolean" ? e.isTalent : null,
        };
      });
    }
    if (p.stats != null) {
      const stats = object(p.stats);
      if (stats.wards != null) {
        if (!Array.isArray(stats.wards) || stats.wards.length > 1000)
          throw Error("INVALID_RESPONSE");
        players[i].wards = stats.wards.map((v) => {
          const e = object(v);
          if (
            !Number.isSafeInteger(e.time) ||
            Math.abs(e.time as number) > 86400 ||
            num(e.type) === null
          )
            throw Error("INVALID_RESPONSE");
          return { time: e.time as number, type: e.type as number };
        });
      }
    }
  }
  const picksBans: MatchAnalytics["picksBans"] = [];
  if (
    m.pickBans != null &&
    (!Array.isArray(m.pickBans) || m.pickBans.length > 100)
  )
    throw Error("INVALID_RESPONSE");
  for (const v of (m.pickBans ?? []) as unknown[]) {
    const p = object(v),
      heroId = num(p.isPick ? p.heroId : (p.bannedHeroId ?? p.heroId)),
      order = num(p.order);
    if (
      heroId &&
      order !== null &&
      typeof p.isPick === "boolean" &&
      (p.isPick || p.wasBannedSuccessfully === true)
    )
      picksBans.push({
        heroId,
        isPick: p.isPick,
        side:
          typeof p.isRadiant === "boolean"
            ? p.isRadiant
              ? "RADIANT"
              : "DIRE"
            : null,
        order,
      });
  }
  return annotate(
    {
      source: "STRATZ",
      contractVersion: 2,
      externalMatchId: expected,
      startedAt: timestamp(m.startDateTime),
      endedAt: timestamp(m.endDateTime),
      gameMode:
        typeof m.gameMode === "string" && /^[A-Z_0-9]{1,80}$/.test(m.gameMode)
          ? m.gameMode
          : null,
      duration: num(m.durationSeconds),
      radiantWin: typeof m.didRadiantWin === "boolean" ? m.didRadiantWin : null,
      players,
      picksBans: picksBans.sort((a, b) => a.order - b.order),
      timeline: [],
      provenance: {},
      conflicts: [],
    },
    "STRATZ",
  );
}
// Reject legacy mixed-provider snapshots on reads as well as cache claims.
// Temporal STRATZ semantics are not verified yet: this contract has no timeline.
export function isStratzMatchAnalytics(
  value: unknown,
  expected: string,
): value is MatchAnalytics {
  return (
    isMatchAnalytics(value, expected) &&
    value.source === "STRATZ" &&
    Object.values(value.provenance).every((v) => v === "STRATZ")
  );
}
export function isMatchAnalytics(
  value: unknown,
  expected: string,
): value is MatchAnalytics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as Partial<MatchAnalytics>;
  return (
    ["GC", "STRATZ", "OPENDOTA", "VALVE"].includes(a.source ?? "") &&
    a.contractVersion === 2 &&
    a.externalMatchId === expected &&
    Array.isArray(a.players) &&
    a.players.length <= 10 &&
    a.players.every(
      (p) =>
        p &&
        typeof p === "object" &&
        Array.isArray(p.items) &&
        p.items.length === 6 &&
        (p.abilityUpgrades === undefined ||
          (Array.isArray(p.abilityUpgrades) &&
            p.abilityUpgrades.length <= 100 &&
            p.abilityUpgrades.every(
              (e) =>
                e &&
                num(e.abilityId)! > 0 &&
                Number.isSafeInteger(e.time) &&
                e.time >= 0 &&
                e.time <= 86400,
            ))) &&
        (p.abilities === undefined ||
          (Array.isArray(p.abilities) &&
            p.abilities.length <= 100 &&
            p.abilities.every(
              (e) =>
                e &&
                num(e.abilityId)! > 0 &&
                num(e.level)! > 0 &&
                Number.isSafeInteger(e.time) &&
                Math.abs(e.time) <= 86400 &&
                (e.isTalent === null || typeof e.isTalent === "boolean"),
            ))) &&
        (p.wards === undefined ||
          (Array.isArray(p.wards) &&
            p.wards.length <= 1000 &&
            p.wards.every(
              (e) =>
                e &&
                num(e.type) !== null &&
                Number.isSafeInteger(e.time) &&
                Math.abs(e.time) <= 86400,
            ))),
    ) &&
    Array.isArray(a.picksBans) &&
    a.picksBans.length <= 100 &&
    Array.isArray(a.timeline) &&
    a.timeline.length === 0 &&
    !!a.provenance &&
    typeof a.provenance === "object" &&
    !Array.isArray(a.provenance) &&
    Object.values(a.provenance).every((v) => v === a.source) &&
    Array.isArray(a.conflicts)
  );
}
