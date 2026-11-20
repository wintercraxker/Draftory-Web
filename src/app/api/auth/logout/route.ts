import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revokeSession } from "@/lib/auth/repository";
import {
  appOrigin,
  authConfig,
  cookieOptions,
  requireSameOrigin,
} from "@/lib/auth/config";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Acción no permitida." },
      { status: 403 },
    );
  }
  try {
    await revokeSession(
      prisma,
      (await cookies()).get(authConfig.sessionCookie)?.value,
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo cerrar la sesión. Inténtalo de nuevo." },
      { status: 503 },
    );
  }
  const response = NextResponse.redirect(
    `${appOrigin()}/?auth=signed_out`,
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(authConfig.sessionCookie, "", cookieOptions(0));
  response.cookies.set(authConfig.stateCookie, "", cookieOptions(0));
  return response;
}
