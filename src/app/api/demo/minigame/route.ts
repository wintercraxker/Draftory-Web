import { createMinigame, commandMinigame } from "@/lib/rooms/minigame-server";
import { firstPickMethods } from "@/lib/rooms/config";
import type { RpsMove } from "@/lib/rooms/minigame";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const publicURL = new URL(request.url);
    publicURL.host = request.headers.get("host") ?? publicURL.host;
    if (origin && origin !== publicURL.origin)
      return Response.json({ error: "Origen no permitido." }, { status: 403 });
    const body = await request.json();
    if (
      body.type === "create" &&
      firstPickMethods.some((method) => method.id === body.game)
    )
      return Response.json(createMinigame(body.game, Date.now()), {
        headers: { "Cache-Control": "no-store" },
      });
    if (
      typeof body.id !== "string" ||
      typeof body.token !== "string" ||
      !["roll", "choose", "reveal", "status", "nextRound"].includes(body.type)
    )
      throw new Error("Petición inválida.");
    return Response.json(
      commandMinigame(
        body.id,
        body.token,
        body.type,
        body.move as RpsMove | undefined,
        Date.now(),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la acción.",
      },
      { status: 400 },
    );
  }
}
