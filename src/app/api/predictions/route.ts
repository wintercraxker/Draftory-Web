import { accountRequest, boundedJson } from "@/lib/real/http";
import {
  readPredictions,
  registerPrediction,
} from "@/lib/real/predictions-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readPredictions(id));
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => registerPrediction(id, await boundedJson(request, 1000)),
    true,
  );
}
