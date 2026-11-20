import { NextResponse, type NextRequest } from "next/server";
import { blockedPreviewPath } from "./lib/deployment/preview-policy.mjs";
export function proxy(request: NextRequest) {
  if (blockedPreviewPath(request.nextUrl.pathname, request.method))
    return NextResponse.json(
      { error: "Esta operación está desactivada en el ensayo privado." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
