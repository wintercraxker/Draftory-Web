import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  authConfig,
  cookieOptions,
  requireSameOrigin,
} from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { eraseAccount, lifecycleInstalled } from "@/lib/real/account-lifecycle";
import { AccountDeletionBlocked } from "@/lib/real/account-erasure-links";
import {
  accountRequest,
  AccountError,
  boundedJson,
  objectInput,
} from "@/lib/real/http";
export async function GET(request: Request) {
  return accountRequest(request, async (id) => ({
    available: await lifecycleInstalled(prisma),
    pending: !!(await prisma.notification.findUnique({
      where: { id: "account-deletion-pending:" + id },
      select: { id: true },
    })),
  }));
}
export async function POST(request: Request) {
  try {
    try {
      requireSameOrigin(request);
    } catch {
      throw new AccountError("Acción no permitida.", 403);
    }
    const user = await getSessionUser();
    if (!user) throw new AccountError("Inicia sesión con Steam.", 401);
    const body = objectInput(await boundedJson(request, 512), ["confirmation"]);
    await eraseAccount(prisma, user.id, body.confirmation);
    const response = NextResponse.json(
      { erased: true, redirect: "/?account=deleted" },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(authConfig.sessionCookie, "", cookieOptions(0));
    response.cookies.set(authConfig.stateCookie, "", cookieOptions(0));
    // Cookie removal is applied only after the transaction has committed.
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ...(error instanceof AccountDeletionBlocked
          ? { pending: true, resolution: error.resolution, block: error.block }
          : {}),
        error:
          error instanceof AccountError
            ? error.message
            : "No se pudo eliminar la cuenta. No se confirmó la operación; inténtalo de nuevo.",
      },
      {
        status: error instanceof AccountError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
