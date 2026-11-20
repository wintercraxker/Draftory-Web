import { accountRequest } from "@/lib/real/http";
import { staffReports } from "@/lib/real/staff-repository";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return accountRequest(request, (id) =>
    staffReports(id, {
      page: Number(p.get("page") ?? 1),
      search: p.get("search") ?? "",
      status: p.get("status") ?? "",
      category: p.get("category") ?? "",
      assignee: p.get("assignee") ?? "",
      user: p.get("user") ?? "",
    }),
  );
}
