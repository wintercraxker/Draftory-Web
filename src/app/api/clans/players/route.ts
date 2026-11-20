import { clanBudget } from "@/lib/real/clan-budget";
import { accountRequest, AccountError } from "@/lib/real/http";
import { prisma } from "@/lib/prisma";
import { clansInstalled } from "@/lib/real/clan-repository";
import { resolveDisplayAvatar } from "@/lib/display-avatar";
export async function GET(request: Request) {
  return accountRequest(request, async (actor) => {
    await clanBudget(actor);
    if (!(await clansInstalled()))
      throw new AccountError("Clanes pendientes de activación.", 503);
    const publicId = (new URL(request.url).searchParams.get("q") ?? "")
      .trim()
      .toUpperCase();
    if (!/^DF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(publicId))
      throw new AccountError("Busca por DF-ID completo.");
    const [p] = await prisma.$queryRaw<
      {
        name: string;
        avatar: string | null;
        customAvatarUrl: string | null;
        publicId: string;
        clan: string | null;
        preferredRole: string | null;
      }[]
    >`SELECT COALESCE(NULLIF(u."displayName",''),'Jugador de Steam') name,u.avatar,u."customAvatarUrl",d."publicId",p."preferredRolePrimary"::text "preferredRole",c.name clan FROM "DraftoryIdentity" d JOIN "User" u ON u.id=d."userId" JOIN "Profile" p ON p."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id LEFT JOIN "ClanMembership" m ON m."userId"=u.id AND m."leftAt" IS NULL LEFT JOIN "Clan" c ON c.id=m."clanId" AND c."disbandedAt" IS NULL WHERE d."publicId"=${publicId} AND (p.visibility='PUBLIC' OR u.id=${actor}) AND p."onboardingCompletedAt" IS NOT NULL AND l."deletedAt" IS NULL`;
    if (!p) throw new AccountError("Jugador no disponible.", 404);
    return {
      name: p.name,
      avatar: resolveDisplayAvatar(p) ?? null,
      publicId: p.publicId,
      preferredRole: p.preferredRole,
      clan: p.clan,
    };
  });
}
