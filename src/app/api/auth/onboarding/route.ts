import { boundedJson, AccountError, objectInput } from "@/lib/real/http";
import { NextResponse, after } from "next/server";
import { lifecycleInstalled } from "@/lib/real/account-lifecycle";
import { ensurePublicIdentity } from "@/lib/real/identity-repository";
import {
  queueInitialDotaProfile,
  prepareInitialDotaProfile,
} from "@/lib/dota-stats/initial-sync";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/config";
import { validateOnboarding } from "@/lib/auth/onboarding";
import { validateDisplayName } from "@/lib/profile-validation";
import type { DotaRole } from "@/generated/prisma/client";
import { declareInitialMmr, mmrInstalled } from "@/lib/real/mmr-repository";
import { validateMmr } from "@/lib/mmr-policy";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: "Acción no permitida." },
      { status: 403 },
    );
  }
  const user = await getSessionUser().catch(() => null);
  if (!user)
    return NextResponse.json(
      { error: "Inicia sesión con Steam." },
      { status: 401 },
    );
  if (user.profile?.onboardingCompletedAt)
    return NextResponse.json({ redirect: "/dashboard" });
  let input;
  try {
    const value = objectInput(await boundedJson(request, 12000), [
      "country",
      "region",
      "preferredRolePrimary",
      "preferredRoleSecondary",
      "displayName",
      "mmr",
    ]);
    input = {
      ...validateOnboarding(value),
      displayName: validateDisplayName(value.displayName),
      mmr: (await mmrInstalled()) ? validateMmr(value.mmr) : null,
    };
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "JSON inválido."
            : error instanceof Error
              ? error.message
              : "Revisa tu perfil.",
      },
      { status: error instanceof AccountError ? error.status : 400 },
    );
  }
  try {
    const data = {
      country: input.country,
      region: input.region,
      preferredRolePrimary:
        input.preferredRolePrimary.toUpperCase() as DotaRole,
      preferredRoleSecondary:
        (input.preferredRoleSecondary?.toUpperCase() as DotaRole) ?? null,
      onboardingCompletedAt: new Date(),
    };
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const profile = await tx.profile.findUnique({
        where: { userId: user.id },
      });
      if (profile?.onboardingCompletedAt) return;
      await tx.user.update({
        where: { id: user.id },
        data: { displayName: input.displayName },
      });
      await tx.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, publicHandle: user.username, ...data },
        update: data,
      });
      await ensurePublicIdentity(tx, user.id);
      if (input.mmr !== null) await declareInitialMmr(tx, user.id, input.mmr);
      if (user.steamId) await queueInitialDotaProfile(tx, user.id);
      if (await lifecycleInstalled(tx))
        await tx.accountLifecycle.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            tourEligible: true,
            tourVersion: input.mmr !== null ? 2 : 1,
          },
          update: {},
        });
    });
    after(async () => {
      try {
        await prepareInitialDotaProfile(prisma, user.id);
      } catch {
        console.warn("DOTA_INITIAL_PREPARATION_UNAVAILABLE");
      }
    });
    return NextResponse.json({ redirect: "/dashboard" });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar tu perfil. Inténtalo de nuevo." },
      { status: 503 },
    );
  }
}
