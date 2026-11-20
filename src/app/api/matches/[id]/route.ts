import { accountRequest } from "@/lib/real/http";
import { readRealMatch } from "@/lib/real/match-detail-repository";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return accountRequest(request, async (actor) => ({
    record: await readRealMatch(actor, (await params).id),
  }));
}
