import { accountRequest, boundedJson } from "@/lib/real/http";
import { mmrCommand, readOwnMmr } from "@/lib/real/mmr-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readOwnMmr(id));
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => mmrCommand(id, await boundedJson(request, 3000)),
    true,
  );
}
