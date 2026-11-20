import { accountRequest } from "@/lib/real/http";
import { readDraftoryStatistics } from "@/lib/real/statistics-repository";
export async function GET(request: Request) {
  return accountRequest(request, (id) =>
    readDraftoryStatistics(
      id,
      new URL(request.url).searchParams.get("handle") ?? undefined,
    ),
  );
}
