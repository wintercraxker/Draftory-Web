import { boundedJson } from "@/lib/real/http";
import { accountRequest } from "@/lib/real/http";
import { lookupRoom } from "@/lib/real/room-repository";
import { AccountError } from "@/lib/real/http";
const limits = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (userId) => {
      const now = Date.now();
      for (const [key, value] of limits)
        if (value.until < now) limits.delete(key);
      const limit = limits.get(userId) ?? { count: 0, until: now + 60000 };
      if (limit.count >= 12)
        throw new AccountError(
          "Espera un momento antes de volver a buscar.",
          429,
        );
      limit.count++;
      limits.set(userId, limit);
      return lookupRoom(await boundedJson(request, 12000));
    },
    true,
  );
}
