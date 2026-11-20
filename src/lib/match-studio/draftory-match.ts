import type { DashboardMatch } from "../dashboard-data";
import type {
  MatchAnalytics,
  AnalyticsSource,
} from "../dota-stats/match-analytics";
import { matchPosition } from "../dota-stats/match-position";
import type { StudioMatch, StudioPlayer } from "./model";

export function analyticsStudio(a: MatchAnalytics): StudioMatch {
  const players: StudioPlayer[] = a.players.map((p, i) => {
    const playedPosition = matchPosition({
      verifiedMode:
        a.provenance.gameMode === a.source
          ? (a.gameMode ?? undefined)
          : undefined,
      position: p.position,
      provider: a.provenance[`players.${p.accountId}.position`] ?? a.source,
    });
    return {
      ...p,
      key: p.accountId ?? `anonymous-${i}`,
      name: p.accountId ? `Cuenta Dota ${p.accountId}` : null,
      playedPosition,
      position: playedPosition?.position ?? null,
      learning: (p.abilities ?? []).map((e) => ({
        abilityId: e.abilityId,
        level: e.level,
        time: e.time,
        talent: e.isTalent === true,
      })),
      abilityMeta: [],
      wardEvents: [],
      dewards: null,
    };
  });
  return {
    id: a.externalMatchId,
    simulated: false,
    status: "AVAILABLE",
    queriedAt: a.obtainedAt ?? "",
    analytics: a,
    players,
    teamNames: { RADIANT: null, DIRE: null },
    timelineCadenceVerified: false,
    timeline: a.timeline.map((p) => ({
      minute: p.minute,
      gold: p.goldAdvantage,
      xp: p.xpAdvantage,
    })),
    fights: [],
    warnings: [
      `Snapshot publicado por ${a.source}; campos ausentes sin dato. No otorga recompensas Draftory.`,
    ],
  };
}

/** Presentation adapter only. Never queries providers, infers stats or settles results. */
export function draftoryStudio(match: DashboardMatch): StudioMatch | null {
  const a = match.analytics;
  if (
    !a ||
    !a.source ||
    !["GC", "STRATZ", "OPENDOTA", "VALVE"].includes(a.source) ||
    !a.externalMatchId
  )
    return null;
  const players: StudioPlayer[] = (["RADIANT", "DIRE"] as const).flatMap(
    (side) =>
      (side === "RADIANT"
        ? (match.radiant?.players ?? [])
        : (match.dire?.players ?? [])
      ).map((identity) => {
        const stats = a.players.find((p) => p.userId === identity.id);
        const playedPosition = matchPosition({
          verifiedMode: match.verifiedMode,
          position: stats?.position,
          provider: stats?.positionSource ?? a.source,
          assignedRole: identity.roomRole,
        });
        return {
          accountId: null,
          side,
          slot: null,
          heroId: null,
          kills: null,
          deaths: null,
          assists: null,
          level: null,
          lastHits: null,
          denies: null,
          gpm: null,
          xpm: null,
          netWorth: null,
          heroDamage: null,
          towerDamage: null,
          heroHealing: null,
          items: Array(6).fill(null),
          neutralItem: null,
          ...stats,
          position: playedPosition?.position ?? null,
          playedPosition,
          key: identity.id,
          userId: identity.id,
          avatar: identity.avatar,
          name: identity.name,
          learning: (stats?.abilities ?? []).map((e) => ({
            abilityId: e.abilityId,
            level: e.level,
            time: e.time,
            talent: e.isTalent === true,
          })),
          abilityMeta: [],
          wardEvents: [],
          dewards: null,
        };
      }),
  );
  const analytics: MatchAnalytics = {
    contractVersion: 2,
    source: a.source as AnalyticsSource,
    externalMatchId: a.externalMatchId,
    duration: a.duration ?? null,
    startedAt: match.playedAt,
    gameMode: match.verifiedMode ?? match.mode,
    radiantWin:
      match.verifiedMode && match.winningSide
        ? match.winningSide === "RADIANT"
        : null,
    players,
    picksBans: a.picksBans,
    timeline: a.timeline,
    provenance: {},
    conflicts: [],
  };
  return {
    id: a.externalMatchId,
    simulated: false,
    status: match.status ?? "UNKNOWN",
    queriedAt: match.playedAt ?? "",
    draftory: {
      region: match.region,
      verified: !!match.verifiedMode,
      officialMvp: match.mvpUserId,
    },
    analytics,
    players,
    teamNames: { RADIANT: null, DIRE: null },
    timelineCadenceVerified: false,
    timeline: a.timeline.map((p) => ({
      minute: p.minute,
      gold: p.goldAdvantage,
      xp: p.xpAdvantage,
    })),
    fights: [],
    warnings: [
      `Estadísticas persistidas · ${a.source}. Los campos ausentes permanecen sin dato.`,
      "Las posiciones distinguen reglas del modo, clasificación del proveedor y asignación explícita. No se infieren del héroe o KDA.",
    ],
  };
}
