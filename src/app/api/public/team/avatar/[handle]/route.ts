import { readPublicTeamAvatar } from "@/lib/real/public-team";
import { profileAvatarResponse } from "@/lib/real/avatar-response";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
) {
  const { handle } = await context.params;
  if (!handle || handle.length > 100)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const avatar = await readPublicTeamAvatar(handle);
    return avatar
      ? profileAvatarResponse(avatar.bytes, avatar.version, "no-store")
      : new Response(null, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
