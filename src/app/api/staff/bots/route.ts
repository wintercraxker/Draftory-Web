import { accountRequest, boundedJson, objectInput } from "@/lib/real/http";
import { requestBotCommand, staffBots } from "@/lib/real/staff-bots";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    staffBots(id, new URL(request.url).searchParams),
  );
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) =>
      requestBotCommand(
        id,
        objectInput(await boundedJson(request, 2000), [
          "reference",
          "action",
          "requestId",
          "confirmed",
        ]),
      ),
    true,
  );
}
