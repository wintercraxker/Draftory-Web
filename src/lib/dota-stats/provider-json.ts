import "server-only";
import { retryAfterMs } from "./retry-after";
import { beginExternalRequest } from "./telemetry";
import { OpenDotaError } from "./opendota";
export async function providerJson(
  url: string,
  options: RequestInit,
  fetcher: typeof fetch = fetch,
  maxBytes = 512 * 1024,
) {
  const timeout = AbortSignal.timeout(10000);
  const finish = beginExternalRequest(url);
  try {
    const r = await fetcher(url, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
      redirect: "error",
      cache: "no-store",
    });
    finish.status(r.status);
    if (!r.ok) {
      throw new OpenDotaError(
        r.status === 429
          ? "RATE_LIMITED"
          : r.status === 404
            ? "NOT_FOUND"
            : "API_ERROR",
        retryAfterMs(r.headers.get("retry-after")),
      );
    }
    if (!r.headers.get("content-type")?.includes("json") || !r.body)
      throw new OpenDotaError("INVALID_RESPONSE");
    const reader = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const v = await reader.read();
        if (v.done) break;
        size += v.value.length;
        if (size > maxBytes) throw new OpenDotaError("INVALID_RESPONSE");
        chunks.push(v.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new OpenDotaError("INVALID_RESPONSE");
    }
  } catch (e) {
    finish.failure(
      e instanceof OpenDotaError
        ? e.reason
        : timeout.aborted
          ? "TIMEOUT"
          : "API_ERROR",
    );
    if (e instanceof OpenDotaError) throw e;
    throw new OpenDotaError(
      timeout.aborted
        ? "TIMEOUT"
        : options.signal?.aborted
          ? "ABORTED"
          : "API_ERROR",
    );
  } finally {
    finish.end();
  }
}
