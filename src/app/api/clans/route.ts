import { clanBudget } from "@/lib/real/clan-budget";
import {
  accountRequest,
  boundedJson,
  objectInput,
  AccountError,
} from "@/lib/real/http";
import { clanCommand, readClans } from "@/lib/real/clan-repository";
import { normalizeAvatar } from "@/lib/real/avatar-repository";
export async function GET(request: Request) {
  return accountRequest(request, async (actor) => {
    await clanBudget(actor);
    const u = new URL(request.url);
    return readClans(
      actor,
      u.searchParams.get("q") ?? "",
      Number(u.searchParams.get("page") ?? 1),
    );
  });
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (actor) => {
      await clanBudget(actor, true);
      let body: unknown, shield: Uint8Array | undefined;
      if (
        request.headers.get("content-type")?.startsWith("multipart/form-data")
      ) {
        const limit = 5 * 1024 * 1024 + 16384;
        if (
          !request.body ||
          Number(request.headers.get("content-length")) > limit
        )
          throw new AccountError("Archivo demasiado grande.", 413);
        const reader = request.body.getReader(),
          parts: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > limit)
              throw new AccountError("Archivo demasiado grande.", 413);
            parts.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        let form: FormData;
        try {
          form = await new Response(Buffer.concat(parts), {
            headers: { "Content-Type": request.headers.get("content-type")! },
          }).formData();
        } catch {
          throw new AccountError("Formulario no válido.");
        }
        if (
          [...form.keys()].some((k) => !["payload", "image"].includes(k)) ||
          form.getAll("payload").length !== 1 ||
          form.getAll("image").length > 1
        )
          throw new AccountError("Campos no permitidos.");
        const payload = form.get("payload");
        if (typeof payload !== "string" || payload.length > 8000)
          throw new AccountError("Formulario no válido.");
        body = JSON.parse(payload);
        const file = form.get("image");
        if (file) {
          if (!(file instanceof File))
            throw new AccountError("Imagen no válida.");
          shield = await normalizeAvatar(
            new Uint8Array(await file.arrayBuffer()),
            file.type,
            file.name,
          );
        }
      } else body = await boundedJson(request, 8000);
      const input = objectInput(body, [
        "action",
        "requestId",
        "clanId",
        "name",
        "tag",
        "description",
        "publicId",
        "id",
        "userId",
        "role",
        "confirm",
        "removeShield",
      ]);
      return clanCommand(actor, input, shield);
    },
    true,
  );
}
