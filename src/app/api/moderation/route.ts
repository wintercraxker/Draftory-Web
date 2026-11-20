import { accountRequest } from "@/lib/real/http";
import { readModeration } from "@/lib/real/moderation-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readModeration(id));
}
