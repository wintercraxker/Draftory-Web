import { boundedJson } from "@/lib/real/http";
import { accountRequest, objectInput } from "@/lib/real/http";
import {
  readAchievements,
  reconcileAchievements,
} from "@/lib/real/achievements-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    readAchievements(
      id,
      new URL(request.url).searchParams.get("handle") ?? undefined,
    ),
  );
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => {
      objectInput(await boundedJson(request, 12000), []);
      return reconcileAchievements(id);
    },
    true,
  );
}
