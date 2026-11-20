import "server-only";
import { retryAfterMs } from "./retry-after";
import { beginExternalRequest } from "./telemetry";
import { dotaStatsConfig as config } from "./config";
import { InvalidDotaResponse, normalizeDota } from "./normalize";
import type { DotaCategory, ExternalReason, NormalizedResult } from "./types";
export class OpenDotaError extends Error {
  reason: ExternalReason;
  retryAfterMs: number | null;
  constructor(reason: ExternalReason, retryAfterMs: number | null = null) {
    super(reason);
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}
export interface DotaProvider {
  fetch(
    category: DotaCategory,
    accountId: string,
    matchId?: string,
    signal?: AbortSignal,
  ): Promise<NormalizedResult>;
}
export class OpenDotaProvider implements DotaProvider {
  fetcher: typeof fetch;
  timeoutMs: number;
  constructor(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
  }
  async fetch(
    category: DotaCategory,
    accountId: string,
    matchId?: string,
    signal?: AbortSignal,
  ) {
    if (
      ![
        "PROFILE",
        "WINLOSS",
        "RECENT_MATCHES",
        "HEROES",
        "PLAYER_STATS",
      ].includes(category)
    )
      throw new OpenDotaError("INVALID_RESPONSE");
    if (
      !/^[1-9]\d{0,9}$/.test(accountId) ||
      BigInt(accountId) > BigInt("4294967295")
    )
      throw new OpenDotaError("INVALID_RESPONSE");
    const suffix = {
      PROFILE: "",
      WINLOSS: "/wl",
      RECENT_MATCHES: "/recentMatches",
      HEROES: "/heroes",
      MATCH: "",
      PLAYER_STATS: "/totals",
      POSITIONS: "",
      ANALYTICS: "",
    }[category];
    const url =
      "https://api.opendota.com/api/" + ("players/" + accountId + suffix);
    const timeout = AbortSignal.timeout(this.timeoutMs),
      combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const finish = beginExternalRequest(url);
    try {
      const response = await this.fetcher(url, {
        headers: {},
        signal: combined,
        cache: "no-store",
        redirect: "error",
      });
      finish.status(response.status);
      if (!response.ok) {
        throw new OpenDotaError(
          response.status === 404
            ? "NOT_FOUND"
            : response.status === 429
              ? "RATE_LIMITED"
              : "API_ERROR",
          retryAfterMs(response.headers.get("retry-after")),
        );
      }
      if (
        Number(response.headers.get("content-length")) >
          config.maxResponseBytes ||
        !response.body
      )
        throw new OpenDotaError("INVALID_RESPONSE");
      const reader = response.body.getReader(),
        parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > config.maxResponseBytes)
            throw new OpenDotaError("INVALID_RESPONSE");
          parts.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const part of parts) {
        buffer.set(part, offset);
        offset += part.length;
      }
      return normalizeDota(
        category,
        JSON.parse(new TextDecoder().decode(buffer)),
        accountId,
        matchId,
      );
    } catch (error) {
      finish.failure(
        error instanceof OpenDotaError
          ? error.reason
          : timeout.aborted
            ? "TIMEOUT"
            : "API_ERROR",
      );
      if (error instanceof OpenDotaError) throw error;
      if (signal?.aborted) throw new OpenDotaError("ABORTED");
      if (timeout.aborted) throw new OpenDotaError("TIMEOUT");
      if (error instanceof InvalidDotaResponse || error instanceof SyntaxError)
        throw new OpenDotaError("INVALID_RESPONSE");
      throw new OpenDotaError("API_ERROR"); // Never propagate fetch errors containing credentials/URLs.
    } finally {
      finish.end();
    }
  }
}
