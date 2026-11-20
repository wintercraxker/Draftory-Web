import { boundedJson } from "@/lib/real/http";
import { accountRequest } from "@/lib/real/http";
import { createRealRoom, listRealRooms } from "@/lib/real/room-repository";
export async function GET(request: Request) {
  return accountRequest(request, listRealRooms);
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => createRealRoom(id, await boundedJson(request, 12000)),
    true,
  );
}
