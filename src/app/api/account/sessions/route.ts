import { cookies } from "next/headers";
import { accountRequest, AccountError, boundedJson } from "@/lib/real/http";
import {
  authConfig,
  cookieOptions,
  requireSameOrigin,
} from "@/lib/auth/config";
import { accountSessions } from "@/lib/auth/session-management";
const limits = new Map<string, { time: number; count: number }>();
function budget(userId: string) {
  const now = Date.now();
  if (limits.size > 2000)
    for (const [id, v] of limits) if (now - v.time > 60000) limits.delete(id);
  const row = limits.get(userId);
  if (
    (row && now - row.time < 60000 && row.count >= 60) ||
    (!row && limits.size > 2000)
  )
    throw new AccountError("Espera antes de volver a intentarlo.", 429);
  limits.set(
    userId,
    row && now - row.time < 60000
      ? { ...row, count: row.count + 1 }
      : { time: now, count: 1 },
  );
}
export async function GET(request: Request) {
  return accountRequest(request, async (userId) => {
    budget(userId);
    return accountSessions(
      userId,
      (await cookies()).get(authConfig.sessionCookie)?.value,
    );
  });
}
export async function POST(request: Request) {
  const response = await accountRequest(request, async (userId) => {
    try {
      requireSameOrigin(request);
    } catch {
      throw new AccountError("Acción no permitida.", 403);
    }
    budget(userId);
    return accountSessions(
      userId,
      (await cookies()).get(authConfig.sessionCookie)?.value,
      await boundedJson(request),
    );
  }); // Self-security operations remain available to suspended users too.
  if (response.ok && (await response.clone().json()).currentRevoked)
    response.cookies.set(authConfig.sessionCookie, "", cookieOptions(0));
  return response;
}
