import { clanBudget } from "@/lib/real/clan-budget";
import { accountRequest } from "@/lib/real/http";
import { readClan } from "@/lib/real/clan-repository";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return accountRequest(request, async (actor) => {
    await clanBudget(actor);
    return readClan(actor, id);
  });
}
