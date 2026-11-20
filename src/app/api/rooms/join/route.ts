import { accountRequest, boundedJson } from "@/lib/real/http";
import { joinRoomByPublicId } from "@/lib/real/room-repository";
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (userId) =>
      joinRoomByPublicId(userId, await boundedJson(request, 1000)),
    true,
  );
}
