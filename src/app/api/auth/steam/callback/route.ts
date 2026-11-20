import {
  reserveRequestBudget,
  RequestLimitError,
} from "@/lib/real/request-budget";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appOrigin, authConfig, cookieOptions } from "@/lib/auth/config";
import {
  hashToken,
  sameToken,
  validToken,
  verifySteamAssertion,
} from "@/lib/auth/openid";
import { createSession, recoverSteamUser } from "@/lib/auth/repository";
import { syncSteamProfile } from "@/lib/dota/steam-service";
import {
  blockedPreviewPath,
  permittedSteamIdentity,
} from "@/lib/deployment/preview-policy.mjs";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (blockedPreviewPath("/api/auth/steam/callback", "GET"))
    return NextResponse.json(
      { error: "Esta operación está desactivada en el ensayo privado." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  let origin: string;
  try {
    origin = appOrigin();
  } catch {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/?auth=not_configured",
        "Cache-Control": "no-store",
      },
    });
  }
  const redirect = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(authConfig.stateCookie, "", cookieOptions(0));
    return response;
  };
  const params = new URL(request.url).searchParams;
  if (
    request.headers.get("host")?.toLowerCase() !==
    new URL(origin).host.toLowerCase()
  )
    return redirect("/?auth=invalid_origin");
  const state = params.get("state");
  const browserState = (await cookies()).get(authConfig.stateCookie)?.value;
  if (!validToken(state) || !browserState || !sameToken(state, browserState))
    return redirect("/?auth=invalid_response");
  try {
    const attempt = await prisma.steamLoginAttempt.findUnique({
      where: { stateHash: hashToken(state) },
    });
    if (
      !attempt ||
      attempt.consumedAt ||
      attempt.expiresAt.getTime() <= Date.now()
    )
      return redirect("/?auth=expired");
    if (params.get("openid.mode") === "cancel") {
      await prisma.steamLoginAttempt.updateMany({
        where: { stateHash: hashToken(state), consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return redirect("/?auth=cancelled");
    }
    let assertion;
    try {
      await reserveRequestBudget("steam-callback", state, 5, 60000);
      assertion = await verifySteamAssertion(params, origin, state);
    } catch (error) {
      if (error instanceof RequestLimitError)
        return NextResponse.json(
          { error: error.message },
          {
            status: 429,
            headers: {
              "Retry-After": String(error.retryAfter),
              "Cache-Control": "no-store",
            },
          },
        );
      return redirect("/?auth=invalid_response");
    }
    const claim = await prisma.steamLoginAttempt.updateMany({
      where: {
        stateHash: hashToken(state),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date(), responseNonce: assertion.nonce },
    });
    if (claim.count !== 1) return redirect("/?auth=expired");
    if (!permittedSteamIdentity(assertion.steamId))
      return redirect("/?auth=trial_not_authorized");
    const user = await recoverSteamUser(prisma, assertion.steamId);
    const token = await createSession(prisma, user.id);
    // The authorized Preview trial is OpenID only, not Steam Web API enrichment.
    if (process.env.VERCEL_ENV !== "preview")
      await syncSteamProfile(prisma, user.id, assertion.steamId);
    const response = redirect(
      user.profile?.onboardingCompletedAt ? "/dashboard" : "/onboarding",
    );
    response.cookies.set(
      authConfig.sessionCookie,
      token,
      cookieOptions(authConfig.sessionSeconds),
    );
    return response;
  } catch {
    return redirect("/?auth=service_unavailable");
  }
}
