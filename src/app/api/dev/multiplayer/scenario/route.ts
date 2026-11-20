import { devRequest } from "@/lib/dev/http";
import { scenario } from "@/lib/dev/multiplayer";
import { objectInput, AccountError } from "@/lib/real/http";
export const runtime = "nodejs";
export {
  devUnsupported as GET,
  devUnsupported as PUT,
  devUnsupported as PATCH,
  devUnsupported as DELETE,
  devUnsupported as OPTIONS,
  devUnsupported as HEAD,
} from "@/lib/dev/http";
export async function POST(request: Request) {
  return devRequest(
    request,
    async () => {
      const body = objectInput(await request.json(), ["reset"]);
      if (body.reset !== undefined && typeof body.reset !== "boolean")
        throw new AccountError("Acción inválida.");
      return scenario(body.reset === true);
    },
    true,
  );
}
