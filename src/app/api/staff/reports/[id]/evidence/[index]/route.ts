import { accountRequest, AccountError } from "@/lib/real/http";
import { readPrivateReportImage } from "@/lib/real/private-report-images";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; index: string }> },
) {
  const { id, index } = await context.params;
  let image: Uint8Array | undefined;
  const checked = await accountRequest(request, async (actor) => {
    if (!/^\d$/.test(index))
      throw new AccountError("Evidencia no disponible.", 404);
    image = await readPrivateReportImage(actor, id, Number(index));
    return { ok: true };
  });
  if (!checked.ok) return checked;
  return new Response(new Uint8Array(image!), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Referrer-Policy": "no-referrer",
      "Content-Disposition": 'inline; filename="evidencia.webp"',
    },
  });
}
