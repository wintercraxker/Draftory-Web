import { cachedHomeStatistics } from "@/lib/real/home-statistics";
export async function GET() {
  try {
    return Response.json(await cachedHomeStatistics(), {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=15" },
    });
  } catch {
    return Response.json(
      { error: "Estadísticas temporalmente no disponibles." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
