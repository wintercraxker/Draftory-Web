import { NextResponse } from "next/server";
import { getSessionIdentity } from "@/lib/auth/session";
import { progressRevision } from "@/lib/real/progress-revision";
export async function GET() {
  try {
    const user = await getSessionIdentity();
    let revision: string | null = null;
    if (user && !user.onboardingRequired) {
      try {
        revision = await progressRevision(user.id);
      } catch {
        console.warn("PROGRESS_REVISION_UNAVAILABLE");
      } // Statistics cannot invalidate a valid session.
    }
    return NextResponse.json(
      { user, progressRevision: revision },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "La sesión no se pudo comprobar." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
