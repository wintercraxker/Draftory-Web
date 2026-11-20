import { accountRequest, boundedJson } from "@/lib/real/http";
import {
  readProfileSocials,
  saveProfileSocials,
} from "@/lib/real/profile-socials";
export async function GET(request: Request) {
  return accountRequest(request, (id) => readProfileSocials(id, id));
}
export async function PUT(request: Request) {
  return accountRequest(
    request,
    async (id) => saveProfileSocials(id, await boundedJson(request, 3000)),
    true,
  );
}
