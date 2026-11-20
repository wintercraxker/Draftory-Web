import { accountRequest, boundedJson, objectInput } from "@/lib/real/http";
import { heartbeatPresence } from "@/lib/real/room-presence";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (userId) => {
      const value = objectInput(await boundedJson(request, 512), [
        "connectionId",
        "release",
      ]);
      if (
        typeof value.connectionId !== "string" ||
        (value.release !== undefined && typeof value.release !== "boolean")
      )
        throw new SyntaxError("Invalid presence payload");
      return heartbeatPresence(
        userId,
        value.connectionId,
        value.release === true,
      );
    },
    true,
  );
}
