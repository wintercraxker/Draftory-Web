import { accountRequest } from "@/lib/real/http";
import { listRealMatches } from "@/lib/real/match-repository";
import { readRealProfile } from "@/lib/real/profile-repository";
import { AccountError } from "@/lib/real/http";
export async function GET(request: Request) {
  return accountRequest(request, async (userId) => {
    const handle = new URL(request.url).searchParams.get("handle");
    const profile = handle ? await readRealProfile(userId, handle) : null;
    if (profile && "projection" in profile)
      throw new AccountError("Perfil no disponible.", 404);
    const target = profile?.id ?? userId;
    const data = await listRealMatches(target, undefined, userId);
    const view = new URL(request.url).searchParams.get("view");
    return view === "live"
      ? {
          ...data,
          records: data.records.filter(
            (record) =>
              record.status === "IN_PROGRESS" &&
              record.tracking.activity === "CONFIRMED",
          ),
        }
      : data;
  });
}
