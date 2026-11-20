import { accountRequest } from "@/lib/real/http";
import { readWallet } from "@/lib/real/points-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readWallet(id));
}
