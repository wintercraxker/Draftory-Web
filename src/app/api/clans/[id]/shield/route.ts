import { prisma } from "@/lib/prisma";
import { clansInstalled } from "@/lib/real/clan-repository";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    v = new URL(request.url).searchParams.get("v");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    !v ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v,
    ) ||
    !(await clansInstalled())
  )
    return new Response(null, { status: 404 });
  const [r] = await prisma.$queryRaw<
    { shield: Uint8Array }[]
  >`SELECT shield FROM "Clan" WHERE id=${id}::uuid AND "shieldVersion"=${v}::uuid AND "disbandedAt" IS NULL AND shield IS NOT NULL`;
  if (!r) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(r.shield), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(r.shield.length),
      "Cache-Control": "public,max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
