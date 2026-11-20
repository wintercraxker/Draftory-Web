import { accountRequest, boundedJson } from "@/lib/real/http";
import {
  readStaff,
  staffAction,
  requireStaff,
} from "@/lib/real/moderation-repository";
export async function GET(request: Request) {
  return accountRequest(request, async (id) => {
    try {
      return await readStaff(
        id,
        new URL(request.url).searchParams.get("search") ?? "",
        undefined,
        Number(new URL(request.url).searchParams.get("page") ?? 1),
        Number(new URL(request.url).searchParams.get("pageSize") ?? 30),
      );
    } catch (error) {
      const e = error as { name?: string; code?: string; message?: string };
      console.error(
        "STAFF_DASHBOARD_LOAD_FAILED",
        JSON.stringify({
          name: e.name,
          code: e.code,
          detail: e.name === "TypeError" ? e.message?.slice(0, 200) : undefined,
          field: e.message?.match(/Unknown (?:argument|field) `([^`]+)`/)?.[1],
        }),
      );
      throw error;
    }
  });
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => {
      await requireStaff(id);
      try {
        return await staffAction(id, await boundedJson(request, 12000));
      } catch (error) {
        // Preserve technical diagnostics without payloads, SQL, credentials or evidence.
        const e = error as { name?: string; code?: string; status?: number };
        if (!e.status)
          console.error(
            "STAFF_ACTION_FAILED",
            JSON.stringify({ name: e.name, code: e.code }),
          );
        throw error;
      }
    },
    true,
  );
}
