import { accountBudget, RequestLimitError } from "./request-budget";
import { NextResponse } from "next/server";
import { getSessionUser } from "../auth/session";
import { requireSameOrigin } from "../auth/config";
import { AccountError } from "./errors";
import { prisma } from "../prisma";
import { assertParticipation } from "./suspension";
import { scheduleMaintenanceCatchup } from "./maintenance-catchup";
export { AccountError } from "./errors";
export async function accountRequest(
  request: Request,
  action: (id: string) => Promise<unknown>,
  write = false,
) {
  try {
    if (write) {
      try {
        requireSameOrigin(request);
      } catch {
        throw new AccountError("Acción no permitida.", 403);
      }
    }
    const user = await getSessionUser();
    if (!user) throw new AccountError("Inicia sesión con Steam.", 401);
    if (!user.profile?.onboardingCompletedAt)
      throw new AccountError("Completa tu perfil.", 403);
    if (write) {
      const pathname = new URL(request.url).pathname;
      let safe = [
        "/api/reports",
        "/api/rooms/presence",
        "/api/notifications",
        "/api/account/tour",
        "/api/account/mmr",
      ].includes(pathname);
      let chat = false;
      if (/^\/api\/rooms\/[^/]+$/.test(pathname)) {
        const payload = (await boundedJson(request.clone(), 12000)) as Record<
          string,
          unknown
        >;
        safe = ["leave", "close", "voteCancel", "expireReadyCheck"].includes(
          String(payload?.action),
        );
        chat = payload?.action === "chat";
      }
      if (!safe)
        await prisma.$transaction((tx) =>
          assertParticipation(tx, [user.id], chat ? "CHAT" : "PARTICIPATION"),
        );
    }
    await accountBudget(request, user.id);
    const result = await action(user.id);
    scheduleMaintenanceCatchup();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof AccountError) && !(error instanceof SyntaxError)) {
      const code = (error as { code?: unknown } | null)?.code;
      console.error("DRAFTORY_REQUEST_FAILED", {
        method: request.method,
        code:
          typeof code === "string" && /^[A-Z0-9_]{1,30}$/.test(code)
            ? code
            : "INTERNAL_ERROR",
      });
    }
    return NextResponse.json(
      {
        error:
          error instanceof AccountError
            ? error.message
            : error instanceof SyntaxError
              ? "JSON inválido."
              : "No se pudo completar la operación. Inténtalo de nuevo.",
      },
      {
        status:
          error instanceof AccountError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 503,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof RequestLimitError
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
export function objectInput(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new AccountError("Campos no permitidos.");
  return value as Record<string, unknown>;
}
export function plainText(
  value: unknown,
  label: string,
  max: number,
  required = true,
) {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > max ||
    /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new AccountError(
      `${label}: revisa el texto y su longitud máxima (${max}).`,
    );
  return value.trim();
}
export async function boundedJson(
  request: Request,
  maxBytes = 8000,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AccountError("Payload demasiado extenso.", 413);
  if (!request.body) throw new AccountError("JSON requerido.");
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > maxBytes)
        throw new AccountError("Payload demasiado extenso.", 413);
      parts.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
