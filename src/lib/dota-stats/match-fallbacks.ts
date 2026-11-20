import {
  annotate,
  normalizeStratzMatch,
  type AnalyticsSource,
  type MatchAnalytics,
} from "./match-analytics";

// Official WebAPI/OpenDota fields only. Absent values remain null in the shared DTO.
export function normalizeValveStyle(
  raw: unknown,
  expected: string,
  source: "GC" | "OPENDOTA" | "VALVE",
): MatchAnalytics {
  if (!raw || typeof raw !== "object") throw Error("INVALID_RESPONSE");
  const m = raw as Record<string, unknown>;
  if (
    String(m.match_id) !== expected ||
    !Array.isArray(m.players) ||
    m.players.length > 10
  )
    throw Error("INVALID_RESPONSE");
  const modes: Record<number, string> = {
    1: "ALL_PICK",
    2: "CAPTAINS_MODE",
    21: "SOLO_MID",
    23: "TURBO",
  };
  const start = typeof m.start_time === "number" ? m.start_time : null;
  const duration = typeof m.duration === "number" ? m.duration : null;
  const snapshot = normalizeStratzMatch(
    {
      data: {
        match: {
          id: expected,
          startDateTime: start,
          endDateTime:
            start !== null && duration !== null ? start + duration : null,
          durationSeconds: duration,
          didRadiantWin: m.radiant_win,
          gameMode: modes[Number(m.game_mode)] ?? null,
          players: m.players.map((value: unknown) => {
            if (!value || typeof value !== "object")
              throw Error("INVALID_RESPONSE");
            const p = value as Record<string, unknown>;
            const slot = p.player_slot;
            return {
              steamAccountId: p.account_id,
              isRadiant:
                typeof slot === "number" &&
                Number.isInteger(slot) &&
                ((slot >= 0 && slot <= 4) || (slot >= 128 && slot <= 132))
                  ? slot < 128
                  : null,
              playerSlot: slot,
              heroId: p.hero_id,
              kills: p.kills,
              deaths: p.deaths,
              assists: p.assists,
              level: p.level,
              numLastHits: p.last_hits,
              numDenies: p.denies,
              goldPerMinute: p.gold_per_min,
              experiencePerMinute: p.xp_per_min,
              networth: p.net_worth,
              heroDamage: p.hero_damage,
              towerDamage: p.tower_damage,
              heroHealing: p.hero_healing,
              ...Object.fromEntries(
                Array.from({ length: 6 }, (_, i) => [
                  `item${i}Id`,
                  p[`item_${i}`],
                ]),
              ),
              neutral0Id: p.item_neutral,
            };
          }),
          pickBans: Array.isArray(m.picks_bans)
            ? m.picks_bans.map((value: Record<string, unknown>) => ({
                heroId: value.hero_id,
                isPick: value.is_pick,
                bannedHeroId: value.hero_id,
                order: value.order,
                isRadiant:
                  value.team === 0 ? true : value.team === 1 ? false : null,
                wasBannedSuccessfully: value.is_pick === false,
              }))
            : [],
        },
      },
    },
    expected,
  );
  snapshot.source = source;
  if (source === "GC") {
    for (const [i, rawPlayer] of (
      m.players as Record<string, unknown>[]
    ).entries()) {
      if (rawPlayer.ability_upgrades === undefined) continue;
      const events = rawPlayer.ability_upgrades;
      if (!Array.isArray(events) || events.length > 100)
        throw Error("INVALID_RESPONSE");
      snapshot.players[i].abilityUpgrades = events.map((e) => {
        if (
          !e ||
          !Number.isSafeInteger(e.ability) ||
          e.ability <= 0 ||
          !Number.isSafeInteger(e.time) ||
          e.time < 0 ||
          e.time > 86400
        )
          throw Error("INVALID_RESPONSE");
        return { abilityId: e.ability, time: e.time };
      });
    }
  }
  snapshot.provenance = {};
  return annotate(snapshot, source);
}

// Preserve a complete provider snapshot. Never silently blend contradictory results.
export function selectMatchSnapshot(snapshots: MatchAnalytics[]) {
  if (!snapshots.length) return null;
  const coverage = (a: MatchAnalytics) =>
    a.players.reduce(
      (n, p) => n + Object.values(p).filter((v) => v !== null).length,
      0,
    ) +
    [a.startedAt, a.endedAt, a.duration, a.radiantWin, a.gameMode].filter(
      (v) => v != null,
    ).length *
      100;
  const primary = snapshots.find(
    (a) =>
      a.source === "GC" &&
      a.radiantWin !== null &&
      a.startedAt &&
      a.duration !== null,
  );
  const chosen = structuredClone(
    primary ?? [...snapshots].sort((a, b) => coverage(b) - coverage(a))[0],
  );
  const conflicts = new Set(chosen.conflicts);
  for (const other of snapshots) {
    for (const key of [
      "duration",
      "radiantWin",
      "gameMode",
      "startedAt",
    ] as const)
      if (
        chosen[key] != null &&
        other[key] != null &&
        chosen[key] !== other[key]
      )
        conflicts.add(key);
    for (const p of chosen.players) {
      const q = other.players.find(
        (q) => p.accountId !== null && q.accountId === p.accountId,
      );
      if (q)
        for (const key of ["heroId", "side"] as const)
          if (p[key] !== null && q[key] !== null && p[key] !== q[key])
            conflicts.add(`players.${p.accountId}.${key}`);
    }
  }
  chosen.conflicts = [...conflicts];
  return chosen;
}
export type ProviderStatus = {
  source: AnalyticsSource;
  status: string;
  retryAfterMs?: number;
};
