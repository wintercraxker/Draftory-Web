import { accountRequest, AccountError } from "@/lib/real/http";
import { readReportIdentity } from "@/lib/real/profile-repository";
import { normalizeDraftoryId } from "@/lib/draftory-id";
import { prisma } from "@/lib/prisma";
// Exact authenticated lookups only. Bounded per-process cache contains no profile data.
const budget = new Map<string, { at: number; count: number }>();
export async function GET(request: Request) {
  return accountRequest(request, async (id) => {
    const now = Date.now(),
      old = budget.get(id);
    if (old && now - old.at < 60000 && old.count >= 20)
      throw new AccountError("Espera antes de buscar otro jugador.", 429);
    if (budget.size >= 2000)
      for (const [key, row] of budget)
        if (now - row.at >= 60000) budget.delete(key);
    if (budget.size >= 2000 && !budget.has(id))
      throw new AccountError("Búsqueda temporalmente ocupada.", 429);
    budget.set(
      id,
      old && now - old.at < 60000
        ? { ...old, count: old.count + 1 }
        : { at: now, count: 1 },
    );
    const publicId = normalizeDraftoryId(
      new URL(request.url).searchParams.get("id"),
    );
    if (!publicId) throw new AccountError("Escribe un DF-ID válido.");
    const result = await readReportIdentity(publicId);
    if (!result) throw new AccountError("Jugador no disponible.", 404);
    const identity = await prisma.draftoryIdentity.findUnique({
      where: { publicId },
      select: { userId: true },
    });
    return { ...result, self: identity?.userId === id };
  });
}
