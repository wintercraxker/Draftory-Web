import { accountRequest } from "@/lib/real/http";
import { prisma } from "@/lib/prisma";
import {
  botHealthEnabled,
  readBotCapacity,
} from "../../../../../apps/dota-worker/shared-health.mjs";
import { competitiveAdmissionOpen } from "../../../../../apps/dota-worker/attempt-authorization.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return accountRequest(request, async () => {
    const operationsEnabled = competitiveAdmissionOpen();
    if (!botHealthEnabled())
      return { enabled: false, operationsEnabled, available: false };
    const rows = await readBotCapacity({
      query: async (sql: string, args: unknown[] = []) => ({
        rows: await prisma.$queryRawUnsafe<Array<{ state: string }>>(
          sql,
          ...args,
        ),
      }),
    });
    // Rooms need aggregate capacity, never individual heartbeats or references.
    // All technical state remains behind the OWNER-only console repository.
    return {
      enabled: true,
      operationsEnabled,
      available:
        operationsEnabled &&
        rows.some((r: { state: string }) => r.state === "HEALTHY"),
    };
  });
}
