import { accountRequest } from "@/lib/real/http";
import { clanBudget } from "@/lib/real/clan-budget";
import { readClanHistory } from "@/lib/real/clan-history-repository";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return accountRequest(request, async (actor) => {
    await clanBudget(actor);
    return readClanHistory(
      id,
      Number(new URL(request.url).searchParams.get("page") ?? 1),
    );
  });
}
