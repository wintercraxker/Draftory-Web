import { profileAvatarResponse } from "@/lib/real/avatar-response";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string; version: string }> },
) {
  const { userId, version } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(userId) || !/^[a-f0-9-]{36}$/.test(version))
    return new Response(null, { status: 404 });
  const row = await prisma.profileAvatar.findUnique({
    where: { userId },
    include: {
      user: { select: { profile: { select: { visibility: true } } } },
    },
  });
  // Avatar is part of the minimum identity even for private Draftory profiles.
  if (
    !row ||
    row.version !== version ||
    (row.user.profile?.visibility !== "PUBLIC" && !(await getSessionUser()))
  )
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return profileAvatarResponse(row.bytes, row.version);
}
