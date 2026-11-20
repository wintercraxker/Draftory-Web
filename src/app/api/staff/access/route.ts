import { getSessionUser } from "@/lib/auth/session";
import { staffAccess } from "@/lib/real/staff-access";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getSessionUser();
    if (!user)
      return Response.json(
        { error: "Inicia sesión con Steam.", code: "SESSION_REQUIRED" },
        { status: 401, headers },
      );
    const access = await staffAccess(user.id);
    const identity = await prisma.draftoryIdentity.findUnique({
      where: { userId: user.id },
      select: { publicId: true },
    });
    const canAccessStaff =
      access.role !== "USER" && Boolean(user.profile?.onboardingCompletedAt);
    console.info(
      "STAFF_ACCESS_CHECK",
      JSON.stringify({
        publicId: identity?.publicId ?? null,
        role: access.role,
        canAccessStaff,
      }),
    );
    return Response.json(
      {
        publicId: identity?.publicId ?? null,
        name: user.displayName ?? user.username,
        ...access,
        canAccessStaff,
        serverNow: new Date().toISOString(),
      },
      { headers },
    );
  } catch {
    console.error("STAFF_ACCESS_BACKEND_UNAVAILABLE");
    return Response.json(
      {
        error: "No se pudieron comprobar los permisos del servidor.",
        code: "STAFF_BACKEND_UNAVAILABLE",
      },
      { status: 503, headers },
    );
  }
}
