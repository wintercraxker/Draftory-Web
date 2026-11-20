import "server-only";
import { reserveRequestBudget, RequestLimitError } from "./request-budget";
const windows = new Map<string, { until: number; count: number }>();
export async function clanBudget(actor: string, write = false) {
  const limit = write ? 30 : 120;
  if (process.env.DRAFTORY_SHARED_RATE_LIMITS === "true")
    return reserveRequestBudget(
      write ? "clan-write" : "clan-read",
      actor,
      limit,
      60000,
    );
  const now = Date.now(),
    key = (write ? "w:" : "r:") + actor;
  for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
  if (!windows.has(key)) {
    if (windows.size >= 4000) windows.delete(windows.keys().next().value!);
    windows.set(key, { until: now + 60000, count: 0 });
  }
  const row = windows.get(key)!;
  if (++row.count > limit)
    throw new RequestLimitError(
      Math.max(1, Math.ceil((row.until - now) / 1000)),
    );
}
