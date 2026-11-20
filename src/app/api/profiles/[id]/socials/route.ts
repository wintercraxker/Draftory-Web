import { accountRequest } from "@/lib/real/http";
import { readProfileSocials } from "@/lib/real/profile-socials";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return accountRequest(request, (actor) => readProfileSocials(actor, id));
}
