import { accountRequest, boundedJson, objectInput } from "@/lib/real/http";
import { readLobbyAccess, checkLobbyAccess } from "@/lib/real/lobby-access";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await accountRequest(
    request,
    async (userId) => {
      if (request.headers.get("content-type")?.includes("application/json")) {
        const input = objectInput(await boundedJson(request, 128), [
          "checkOnly",
        ]);
        if (input.checkOnly !== true) throw new SyntaxError();
        return checkLobbyAccess(userId, id);
      }
      return readLobbyAccess(userId, id);
    },
    true,
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
