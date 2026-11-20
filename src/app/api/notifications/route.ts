import {
  accountRequest,
  objectInput,
  AccountError,
  boundedJson,
} from "@/lib/real/http";
import {
  readNotifications,
  markNotifications,
} from "@/lib/real/notifications-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readNotifications(id));
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (userId) => {
      const p = objectInput(await boundedJson(request, 2000), ["id", "all"]);
      if (p.all === true && p.id === undefined)
        return markNotifications(userId, null);
      if (typeof p.id === "string" && p.all === undefined)
        return markNotifications(userId, p.id);
      throw new AccountError("Acción inválida.");
    },
    true,
  );
}
