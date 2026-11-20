import { boundedJson } from "@/lib/real/http";
import { accountRequest } from "@/lib/real/http";
import {
  editRealProfile,
  readRealProfile,
} from "@/lib/real/profile-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    readRealProfile(
      id,
      new URL(request.url).searchParams.get("handle") ?? undefined,
    ),
  );
}
export async function PATCH(request: Request) {
  return accountRequest(
    request,
    async (id) => editRealProfile(id, await boundedJson(request, 12000)),
    true,
  );
}
