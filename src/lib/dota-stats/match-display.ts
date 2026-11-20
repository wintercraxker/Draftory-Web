import type { AnalyticsPlayer, MatchAnalytics } from "./match-analytics";
export const positionNames = [
  "Hard Carry",
  "Midlaner",
  "Offlaner",
  "Support",
  "Hard Support",
] as const;
export function kda(p: Pick<AnalyticsPlayer, "kills" | "deaths" | "assists">) {
  return ![p.kills, p.deaths, p.assists].every(
    (v) => typeof v === "number" && Number.isFinite(v),
  )
    ? null
    : (p.kills! + p.assists!) / Math.max(1, p.deaths!);
}
export function total(
  players: AnalyticsPlayer[],
  field: keyof AnalyticsPlayer,
  teamSize = 5,
) {
  const values = players.map((p) => p[field]);
  return players.length === teamSize &&
    values.every((v) => typeof v === "number")
    ? (values as number[]).reduce((a, b) => a + b, 0)
    : null;
}
export function positionPairs<
  T extends Pick<AnalyticsPlayer, "position" | "side">,
>(players: T[]) {
  return positionNames.flatMap((name, i) => {
    const position = `POSITION_${i + 1}`,
      a = players.filter(
        (p) => p.side === "RADIANT" && p.position === position,
      ),
      b = players.filter((p) => p.side === "DIRE" && p.position === position);
    return a.length === 1 && b.length === 1
      ? [{ name, radiant: a[0], dire: b[0] }]
      : [];
  });
}
export function standout<T extends AnalyticsPlayer>(players: T[]) {
  return (
    [...players]
      .filter((p) => kda(p) !== null)
      .sort(
        (a, b) =>
          kda(b)! - kda(a)! ||
          (b.kills ?? 0) - (a.kills ?? 0) ||
          (a.accountId ?? "").localeCompare(b.accountId ?? ""),
      )[0] ?? null
  );
}
export function snapshotCoverage(a: MatchAnalytics) {
  return (
    a.players.reduce(
      (n, p) =>
        n +
        Object.values(p).filter((v) => v !== null && !Array.isArray(v)).length +
        p.items.filter((v) => v !== null).length,
      0,
    ) + a.picksBans.length
  );
}
export function poorerSnapshot(old: MatchAnalytics, next: MatchAnalytics) {
  if (old.externalMatchId !== next.externalMatchId) return false;
  if (
    ["startedAt", "endedAt", "gameMode", "duration", "radiantWin"].some(
      (key) =>
        old[key as keyof MatchAnalytics] != null &&
        next[key as keyof MatchAnalytics] == null,
    )
  )
    return true;
  return (
    next.players.length < old.players.length ||
    snapshotCoverage(next) < snapshotCoverage(old) ||
    old.players.some((p) => {
      const n = next.players.find((v) =>
        p.accountId !== null
          ? v.accountId === p.accountId
          : v.side === p.side && v.slot === p.slot,
      );
      if (!n) return true;
      return (
        Object.entries(p).some(([key, value]) => {
          const incoming = n[key as keyof AnalyticsPlayer];
          return (
            value != null &&
            (Array.isArray(value)
              ? !Array.isArray(incoming) || incoming.length < value.length
              : incoming == null)
          );
        }) || p.items.some((v, i) => v !== null && n.items[i] === null)
      );
    })
  );
}
