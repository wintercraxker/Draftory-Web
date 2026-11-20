import { clanBudget } from "@/lib/real/clan-budget";
import { accountRequest, AccountError } from "@/lib/real/http";
import { clanIdentities } from "@/lib/real/clan-repository";
export async function GET(request: Request) {
  return accountRequest(request, async (actor) => {
    await clanBudget(actor);
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    if (raw.length > 10099) throw new AccountError("Demasiadas identidades.");
    const ids = raw.split(",").filter(Boolean);
    if (ids.length > 100 || ids.some((i) => !/^[A-Za-z0-9_-]{1,100}$/.test(i)))
      throw new AccountError("Identidades no válidas.");
    return { identities: await clanIdentities(actor, ids) };
  });
}
