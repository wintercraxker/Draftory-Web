import { boundedJson } from "@/lib/real/http";
import { accountRequest } from "@/lib/real/http";
import { readRealRoom, roomAction } from "@/lib/real/room-repository";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return accountRequest(request, (user) => readRealRoom(user, id));
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return accountRequest(
    request,
    async (user) => roomAction(user, id, await boundedJson(request, 12000)),
    true,
  );
}
