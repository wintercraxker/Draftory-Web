import { accountRequest } from "@/lib/real/http";
import { profileRecognition } from "@/lib/real/profile-recognition";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return accountRequest(request, () => profileRecognition(id));
}
