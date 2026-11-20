import { accountRequest, boundedJson } from "@/lib/real/http";
import { mmrCommand, staffMmrFeed } from "@/lib/real/mmr-repository";
import { requireSameOrigin } from "@/lib/auth/config";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    staffMmrFeed(id, new URL(request.url).searchParams),
  );
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch {
    return NextResponse.json(
      {
        error:
          "La comprobación de seguridad de la solicitud falló. Recarga la página e inténtalo de nuevo.",
        code: "CSRF_INVALID",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return accountRequest(
    request,
    async (id) => mmrCommand(id, await boundedJson(request, 6000), true),
    true,
  );
}
