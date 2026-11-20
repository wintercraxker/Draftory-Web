import { accountRequest, boundedJson } from "@/lib/real/http";
import {
  readManualMedal,
  declareMedal,
} from "@/lib/real/moderation-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    readManualMedal(
      id,
      new URL(request.url).searchParams.get("handle") ?? undefined,
    ),
  );
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => declareMedal(id, await boundedJson(request, 1000)),
    true,
  );
}
