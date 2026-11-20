import {
  accountRequest,
  boundedJson,
  objectInput,
  AccountError,
} from "@/lib/real/http";
import { prisma } from "@/lib/prisma";
import { synchronizeMatchAnalytics } from "@/lib/real/match-analytics-repository";
import { dotaStatsEnabled } from "@/lib/dota-stats/config";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return accountRequest(
    request,
    async (actor) => {
      if (!dotaStatsEnabled()) throw new AccountError("No disponible.", 404);
      objectInput(await boundedJson(request), []);
      return synchronizeMatchAnalytics(prisma, actor, (await params).id);
    },
    true,
  );
}
