import {
  reserveRequestBudget,
  loginBudgetSubject,
  RequestLimitError,
} from "@/lib/real/request-budget";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  appOrigin,
  authConfig,
  cookieOptions,
  missingAuthConfiguration,
} from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { hashToken, newToken, steamLoginUrl } from "@/lib/auth/openid";
import { blockedPreviewPath } from "@/lib/deployment/preview-policy.mjs";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (blockedPreviewPath("/api/auth/steam", "GET"))
    return NextResponse.json(
      { error: "Esta operación está desactivada en el ensayo privado." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  if (missingAuthConfiguration().length)
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/?auth=not_configured",
        "Cache-Control": "no-store",
      },
    });
  const origin = appOrigin();
  // Next may construct request.url with the internal server hostname behind a
  // proxy. Check the public Host, but never use it to construct realm/return_to.
  if (
    request.headers.get("host")?.toLowerCase() !==
    new URL(origin).host.toLowerCase()
  )
    return NextResponse.redirect(`${origin}/?auth=invalid_origin`, 303);
  try {
    const user = await getSessionUser();
    if (user)
      return NextResponse.redirect(
        `${origin}${user.profile?.onboardingCompletedAt ? "/dashboard" : "/onboarding"}`,
        303,
      );
    const budgetSubject = loginBudgetSubject(request);
    await reserveRequestBudget(
      "steam-login",
      budgetSubject,
      budgetSubject === "deployment-global" ? 1000 : 30,
      60000,
    );
    const state = newToken();
    await prisma.steamLoginAttempt.create({
      data: {
        stateHash: hashToken(state),
        expiresAt: new Date(Date.now() + authConfig.stateSeconds * 1000),
      },
    });
    const response = NextResponse.redirect(steamLoginUrl(origin, state), 303);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      authConfig.stateCookie,
      state,
      cookieOptions(authConfig.stateSeconds),
    );
    return response;
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
    return NextResponse.redirect(`${origin}/?auth=service_unavailable`, 303);
  }
}
