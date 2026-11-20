import "server-only";
import { providerJson } from "./provider-json";
import { OpenDotaError } from "./opendota";
import { normalizeStratzMatch } from "./match-analytics";
import {
  normalizeValveStyle,
  selectMatchSnapshot,
  type ProviderStatus,
} from "./match-fallbacks";
import type { MatchAnalytics, AnalyticsSource } from "./match-analytics";
// Fields verified in the authenticated schema snapshots in docs, not guessed.
export const stratzMatchQuery =
  "query DraftoryMatch($id: Long!) { match(id:$id) { id startDateTime endDateTime gameMode durationSeconds didRadiantWin players { steamAccountId isRadiant playerSlot heroId kills deaths assists level numLastHits numDenies goldPerMinute experiencePerMinute networth heroDamage towerDamage heroHealing position item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id } pickBans { isPick heroId bannedHeroId order isRadiant wasBannedSuccessfully } } }";
export const stratzExtendedMatchQuery = stratzMatchQuery.replace(
  "neutral0Id }",
  "neutral0Id abilities { abilityId time level isTalent } stats { wards { time type } } }",
);
export async function fetchMatchAnalytics(
  matchId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[1-9]\d{0,19}$/.test(matchId))
    throw new OpenDotaError("INVALID_RESPONSE");
  try {
    {
      const token = process.env.STRATZ_TOKEN?.trim();
      if (!token) throw new OpenDotaError("NOT_CONFIGURED");
      // GraphQL Long JSON numeric representation: reject imprecise numbers.
      if (BigInt(matchId) > BigInt(Number.MAX_SAFE_INTEGER))
        throw new OpenDotaError("INVALID_RESPONSE");
      const raw = await providerJson(
        "https://api.stratz.com/graphql",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "STRATZ_API",
          },
          body: JSON.stringify({
            query:
              process.env.DRAFTORY_STRATZ_MATCH_EXTENDED === "true"
                ? stratzExtendedMatchQuery
                : stratzMatchQuery,
            variables: { id: Number(matchId) },
          }),
        },
        fetcher,
      );
      if (
        raw &&
        typeof raw === "object" &&
        "data" in raw &&
        (raw as { data?: { match?: unknown } }).data?.match === null
      )
        throw new OpenDotaError("NOT_FOUND");
      return normalizeStratzMatch(raw, matchId);
    }
  } catch (e) {
    if (e instanceof OpenDotaError) throw e;
    throw new OpenDotaError(
      e instanceof Error && e.message === "API_ERROR"
        ? "API_ERROR"
        : "INVALID_RESPONSE",
    );
  }
}

export async function fetchMatchSources(
  matchId: string,
  permit: (source: Exclude<AnalyticsSource, "GC">) => Promise<boolean>,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[1-9]\d{0,19}$/.test(matchId))
    throw new OpenDotaError("INVALID_RESPONSE");
  const statuses: ProviderStatus[] = [],
    snapshots: MatchAnalytics[] = [];
  for (const source of ["VALVE", "STRATZ", "OPENDOTA"] as const) {
    const key = process.env.STEAM_WEB_API_KEY?.trim();
    if (
      (source === "VALVE" && !key) ||
      (source === "STRATZ" &&
        (process.env.DRAFTORY_ENABLE_STRATZ !== "true" ||
          !process.env.STRATZ_TOKEN?.trim()))
    ) {
      statuses.push({ source, status: "NOT_CONFIGURED" });
      continue;
    }
    if (!(await permit(source))) {
      statuses.push({ source, status: "RATE_LIMITED" });
      continue;
    }
    try {
      let a: MatchAnalytics;
      if (source === "STRATZ") a = await fetchMatchAnalytics(matchId, fetcher);
      else {
        const raw = await providerJson(
          source === "VALVE"
            ? `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/?key=${encodeURIComponent(key!)}&match_id=${matchId}`
            : `https://api.opendota.com/api/matches/${matchId}`,
          {},
          fetcher,
        );
        const payload =
          source === "VALVE" ? (raw as { result?: unknown }).result : raw;
        if (
          source === "VALVE" &&
          payload &&
          typeof payload === "object" &&
          "error" in payload
        )
          throw new OpenDotaError("NO_PUBLIC_DATA");
        a = normalizeValveStyle(payload, matchId, source);
      }
      a.obtainedAt = new Date().toISOString();
      snapshots.push(a);
      statuses.push({ source, status: "AVAILABLE" });
    } catch (e) {
      statuses.push({
        source,
        status: e instanceof OpenDotaError ? e.reason : "INVALID_RESPONSE",
        ...(e instanceof OpenDotaError && e.retryAfterMs
          ? { retryAfterMs: e.retryAfterMs }
          : {}),
      });
    }
  }
  return {
    snapshot: selectMatchSnapshot(snapshots),
    statuses,
    evidence: snapshots,
  };
}
