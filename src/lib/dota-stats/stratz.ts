import "server-only";
import { providerJson } from "./provider-json";
import { OpenDotaError, type DotaProvider } from "./opendota";
import type { NormalizedResult, DotaCategory, StratzAnalytics } from "./types";

// Verified via authenticated introspection, 2026-10-07. Role aggregates are
// STRATZ categories; they are not the five Draftory preferred/room roles.
export const stratzAnalyticsQuery =
  "query DraftoryAnalytics($id: Long!) { player(steamAccountId: $id) { steamAccountId imp steamAccount { isStratzPublic isAnonymous } performance { position { roleType roleMatchCount roleWinCount lanes { laneType laneMatchCount laneWinCount } } } } }";
export function normalizeStratz(
  raw: unknown,
  accountId: string,
): NormalizedResult {
  const p = (
    raw as {
      data?: {
        player?: {
          steamAccountId?: unknown;
          imp?: unknown;
          steamAccount?: { isStratzPublic?: unknown; isAnonymous?: unknown };
          performance?: { position?: unknown };
        };
      };
    }
  )?.data?.player;
  if (
    !p ||
    String(p.steamAccountId) !== accountId ||
    typeof p.steamAccount?.isStratzPublic !== "boolean" ||
    typeof p.steamAccount.isAnonymous !== "boolean"
  )
    throw new OpenDotaError("INVALID_RESPONSE");
  const rows = p.performance?.position ?? [];
  if (!Array.isArray(rows) || rows.length > 20)
    throw new OpenDotaError("INVALID_RESPONSE");
  const count = (v: unknown): number => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
      throw new OpenDotaError("INVALID_RESPONSE");
    return v;
  };
  const roles = rows.map((row) => {
    const role = row.roleType,
      games = count(row.roleMatchCount),
      wins = count(row.roleWinCount);
    if (
      !["CORE", "LIGHT_SUPPORT", "HARD_SUPPORT", "UNKNOWN"].includes(role) ||
      wins > games ||
      (row.lanes != null &&
        (!Array.isArray(row.lanes) || row.lanes.length > 10))
    )
      throw new OpenDotaError("INVALID_RESPONSE");
    return {
      role,
      games,
      wins,
      winrate: games ? (wins / games) * 100 : null,
      lanes: (row.lanes ?? []).map(
        (l: {
          laneType: unknown;
          laneMatchCount: unknown;
          laneWinCount: unknown;
        }) => {
          const games = count(l.laneMatchCount),
            wins = count(l.laneWinCount);
          if (wins > games) throw new OpenDotaError("INVALID_RESPONSE");
          return { lane: count(l.laneType), games, wins };
        },
      ),
    };
  });
  const data: StratzAnalytics = {
    imp:
      typeof p.imp === "number" && Number.isSafeInteger(p.imp) ? p.imp : null,
    isStratzPublic: p.steamAccount.isStratzPublic,
    isAnonymous: p.steamAccount.isAnonymous,
    roles,
  };
  if (!data.isStratzPublic) {
    data.imp = null;
    data.roles = [];
  }
  return {
    data,
    empty: !data.isStratzPublic || (data.imp === null && !roles.length),
    coverage: {
      scope: "stratz_published_performance_role_aggregates",
      sampleSize: null,
    },
  };
}

// Contract verified by the controlled GraphQL introspection recorded in docs.
// Synchronization is explicitly opt-in; rendering never probes the provider.
export class StratzProvider implements DotaProvider {
  private fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }
  // Explicit administrative probe only. Synchronization never calls this.
  async probe(fetcher: typeof fetch = fetch, contract = false) {
    const token = process.env.STRATZ_TOKEN?.trim();
    const query = contract
      ? "query DraftorySchemaProbe { __schema { types { name kind fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name ofType { kind name } } } } enumValues { name } } } }"
      : "query DraftoryContractProbe { __typename }";
    if (!token)
      return {
        query,
        status: null,
        contentType: null,
        state: "NOT_CONFIGURED",
        data: null,
        errors: [],
        rateLimits: {},
      };
    try {
      const response = await fetcher("https://api.stratz.com/graphql", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "STRATZ_API",
        },
        body: JSON.stringify({ query }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const rateLimits = Object.fromEntries(
        [...response.headers].filter(([key]) =>
          /^(x-rate.?limit|ratelimit|retry-after)/i.test(key),
        ),
      );
      const json = contentType.includes("json") ? await response.json() : null;
      const data =
        contract && Array.isArray(json?.data?.__schema?.types)
          ? {
              types: json.data.__schema.types.filter((t: { name?: string }) =>
                /DotaQuery|Player|SteamAccount|Position|Lane/.test(
                  t.name ?? "",
                ),
              ),
            }
          : json?.data?.__typename
            ? { __typename: String(json.data.__typename).slice(0, 80) }
            : null;
      return {
        query,
        status: response.status,
        contentType,
        state: response.ok && data ? "AVAILABLE" : "PROVIDER_UNAVAILABLE",
        data,
        errors: Array.isArray(json?.errors)
          ? json.errors.map(() => "GRAPHQL_ERROR")
          : [],
        rateLimits,
      };
    } catch {
      return {
        query,
        status: null,
        contentType: null,
        state: "PROVIDER_UNAVAILABLE",
        data: null,
        errors: ["NETWORK_OR_TIMEOUT"],
        rateLimits: {},
      };
    }
  }
  async fetch(
    category: DotaCategory,
    accountId: string,
    _matchId?: string,
    signal?: AbortSignal,
  ): Promise<NormalizedResult> {
    const token = process.env.STRATZ_TOKEN?.trim();
    if (!token) throw new OpenDotaError("NOT_CONFIGURED");
    if (
      category !== "ANALYTICS" ||
      !/^[1-9]\d{0,9}$/.test(accountId) ||
      BigInt(accountId) > BigInt("4294967295")
    )
      throw new OpenDotaError("INVALID_RESPONSE");
    const raw = await providerJson(
      "https://api.stratz.com/graphql",
      {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "STRATZ_API",
        },
        body: JSON.stringify({
          query: stratzAnalyticsQuery,
          variables: { id: Number(accountId) },
        }),
      },
      this.fetcher,
      100000,
    );
    if (raw.errors?.length) throw new OpenDotaError("API_ERROR");
    try {
      return normalizeStratz(raw, accountId);
    } catch {
      throw new OpenDotaError("INVALID_RESPONSE");
    }
  }
}
