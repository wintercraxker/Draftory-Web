import { NextResponse } from "next/server";
import { AccountError } from "../real/http";
import { multiplayerEnabled } from "./multiplayer";

export function devGate(request: Request, write = false) {
  if (!multiplayerEnabled()) throw new AccountError("No disponible.", 404);
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new AccountError("No disponible.", 404);
  if (write && request.headers.get("origin") !== url.origin)
    throw new AccountError("Origen no permitido.", 403);
}
export async function devRequest(
  request: Request,
  action: () => Promise<unknown>,
  write = false,
) {
  try {
    devGate(request, write);
    return NextResponse.json(await action(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AccountError
            ? error.message
            : "El entorno aislado no está instalado o disponible.",
      },
      { status: error instanceof AccountError ? error.status : 503 },
    );
  }
}
export async function devUnsupported(request: Request) {
  return devRequest(request, async () => {
    throw new AccountError("Método no permitido.", 405);
  });
}
