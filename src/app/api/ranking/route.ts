import { accountRequest } from "@/lib/real/http";
import { readRanking } from "@/lib/real/ranking-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => {
    const q = new URL(request.url).searchParams;
    return readRanking(
      id,
      q.get("q") ?? "",
      q.has("page") ? Number(q.get("page")) : 1,
    );
  });
}
