import { boundedJson } from "@/lib/real/http";
import { NextResponse } from "next/server";
import { accountRequest, AccountError, objectInput } from "@/lib/real/http";
import { prisma } from "@/lib/dota-stats/db";
import {
  authorizeDotaAccount,
  DotaAccessError,
  readDotaCache,
} from "@/lib/dota-stats/cache";
import { dotaStatsEnabled } from "@/lib/dota-stats/config";
import { syncDotaProfile, readProfileBundle } from "@/lib/dota-stats/sync";
import { fetchHeroCatalog } from "@/lib/dota-stats/catalog";
import type { DotaCategory } from "@/lib/dota-stats/types";

function selection(category: unknown, matchId: unknown) {
  if (
    !["PROFILE", "WINLOSS", "RECENT_MATCHES", "HEROES"].includes(
      String(category),
    )
  )
    throw new AccountError("Categoría no permitida.");
  if (matchId !== undefined && matchId !== null)
    throw new AccountError("Identificador de partida inválido.");
  return {
    category: category as DotaCategory,
    matchId: typeof matchId === "string" ? matchId : undefined,
  };
}
async function authorized(actor: string, handle?: string) {
  try {
    return await authorizeDotaAccount(prisma, actor, handle);
  } catch (error) {
    if (error instanceof DotaAccessError)
      throw new AccountError(
        error.status === 404
          ? "Perfil no disponible."
          : "Identidad Dota no disponible.",
        error.status,
      );
    throw error;
  }
}
function disabled() {
  return NextResponse.json(
    { error: "No disponible." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(request: Request) {
  if (!dotaStatsEnabled()) return disabled();
  return accountRequest(request, async (actor) => {
    const query = new URL(request.url).searchParams;
    if (query.get("bundle") === "true") {
      await authorized(actor, query.get("handle") ?? undefined);
      return readProfileBundle(prisma, actor, query.get("handle") ?? undefined);
    }
    const { category, matchId } = selection(
      query.get("category") ?? "PROFILE",
      query.get("matchId"),
    );
    const target = await authorized(actor, query.get("handle") ?? undefined);
    return readDotaCache(
      prisma,
      target.userId,
      category,
      matchId ?? target.accountId,
    );
  });
}
export async function POST(request: Request) {
  if (!dotaStatsEnabled()) return disabled();
  return accountRequest(
    request,
    async (actor) => {
      const body = objectInput(await boundedJson(request, 12000), [
        "requestId",
      ]);
      if (
        typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.requestId,
        )
      )
        throw new AccountError("Petición inválida.");
      await authorized(actor);
      return syncDotaProfile(
        prisma,
        actor,
        body.requestId,
        undefined,
        fetchHeroCatalog,
      );
    },
    true,
  );
}
