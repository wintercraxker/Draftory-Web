import { accountRequest, AccountError } from "@/lib/real/http";
import { saveAvatar, removeAvatar } from "@/lib/real/avatar-repository";
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (actor) => {
      const max = 5 * 1024 * 1024 + 65536;
      if (Number(request.headers.get("content-length")) > max || !request.body)
        throw new AccountError("Archivo demasiado grande.", 413);
      const reader = request.body.getReader(),
        parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > max)
            throw new AccountError("Archivo demasiado grande.", 413);
          parts.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      let form: FormData;
      try {
        form = await new Response(Buffer.concat(parts), {
          headers: {
            "Content-Type": request.headers.get("content-type") ?? "",
          },
        }).formData();
      } catch {
        throw new AccountError("Archivo inválido.");
      }
      if ([...form.keys()].length !== 1 || !form.has("image"))
        throw new AccountError("Campos no permitidos.");
      const file = form.get("image");
      if (!(file instanceof File))
        throw new AccountError("Selecciona una imagen.");
      return saveAvatar(
        actor,
        new Uint8Array(await file.arrayBuffer()),
        file.type,
        file.name,
      );
    },
    true,
  );
}
export async function DELETE(request: Request) {
  return accountRequest(request, (actor) => removeAvatar(actor), true);
}
