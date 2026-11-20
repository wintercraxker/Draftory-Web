import { accountRequest, boundedJson, objectInput } from "@/lib/real/http";
import { synchronizeFreePredictions } from "@/lib/real/predictions-repository";
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => {
      objectInput(await boundedJson(request, 100), []);
      return synchronizeFreePredictions(id);
    },
    true,
  );
}
