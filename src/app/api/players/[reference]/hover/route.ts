import { accountRequest } from "@/lib/real/http";
import { readPlayerHover } from "@/lib/real/player-hover-repository";
import {
  reserveRequestBudget,
  RequestLimitError,
} from "@/lib/real/request-budget";
// Bounded fallback until the existing shared-budget migration is activated.
const windows = new Map<
  string,
  {
    until: number;
    count: number;
  }
>();
async function budget(actor: string) {
  if (process.env.DRAFTORY_SHARED_RATE_LIMITS === "true") {
    await reserveRequestBudget("player-hover", actor, 90, 60000);
    return;
  }
  const now = Date.now();
  for (const [key, row] of windows) if (row.until <= now) windows.delete(key);
  let row = windows.get(actor);
  if (!row) {
    if (windows.size >= 2000) windows.delete(windows.keys().next().value!);
    row = { until: now + 60000, count: 0 };
    windows.set(actor, row);
  }
  if (++row.count > 90)
    throw new RequestLimitError(
      Math.max(1, Math.ceil((row.until - now) / 1000)),
    );
}
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      reference: string;
    }>;
  },
) {
  return accountRequest(request, async (actor) => {
    const { reference } = await context.params;
    await budget(actor);
    return readPlayerHover(actor, reference);
  });
}
