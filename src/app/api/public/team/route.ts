import { readPublicTeam } from "@/lib/real/public-team";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await readPublicTeam(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "El equipo no está disponible temporalmente." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
