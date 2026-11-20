import { accountRequest, AccountError } from "@/lib/real/http";
import { createReport } from "@/lib/real/moderation-repository";
import {
  evidenceStoreConfigured,
  privateEvidenceStore,
} from "@/lib/real/r2-evidence-store";
import { sweepOrphanEvidence } from "@/lib/real/private-report-images";
const budgets = new Map<string, { at: number; count: number }>();
function budget(id: string) {
  const now = Date.now();
  for (const [key, v] of budgets) if (now - v.at > 3600000) budgets.delete(key);
  const row = budgets.get(id);
  if ((row?.count ?? 0) >= 20 || (!row && budgets.size >= 2000))
    throw new AccountError("Espera antes de adjuntar más capturas.", 429);
  budgets.set(id, { at: row?.at ?? now, count: (row?.count ?? 0) + 1 });
}
export async function GET() {
  return Response.json(
    { privateImages: evidenceStoreConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  return accountRequest(
    request,
    async (id) => {
      if (
        !(request.headers.get("content-type") ?? "").startsWith(
          "multipart/form-data",
        )
      ) {
        const { boundedJson } = await import("@/lib/real/http");
        return createReport(id, await boundedJson(request, 16000));
      }
      budget(id);
      if (!evidenceStoreConfigured())
        throw new AccountError(
          "El almacenamiento privado no está disponible.",
          503,
        );
      const reader = request.body?.getReader();
      if (!reader) throw new AccountError("Formulario incompleto.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.length;
          if (size > 16 * 1024 * 1024)
            throw new AccountError(
              "Las capturas superan el tamaño permitido.",
              413,
            );
          chunks.push(r.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const body = Buffer.concat(chunks);
      let form: FormData;
      try {
        form = await new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": request.headers.get("content-type")! },
          body,
        }).formData();
      } catch {
        throw new AccountError("Formulario no válido.");
      }
      if (
        [...form.keys()].some((k) => !["payload", "images"].includes(k)) ||
        form.getAll("payload").length !== 1
      )
        throw new AccountError("Campos no permitidos.");
      const raw = form.get("payload");
      if (typeof raw !== "string" || raw.length > 16000)
        throw new AccountError("Formulario no válido.");
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new AccountError("Formulario no válido.");
      }
      const files = form.getAll("images");
      if (
        files.length > 3 ||
        files.some((f) => typeof f === "string" || f.size > 5 * 1024 * 1024)
      )
        throw new AccountError("Hasta 3 imágenes de 5 MB cada una.", 413);
      const images = await Promise.all(
        files.map(async (f) => ({
          bytes: new Uint8Array(await (f as File).arrayBuffer()),
          type: (f as File).type,
        })),
      );
      const result = await createReport(
        id,
        payload,
        undefined,
        undefined,
        images,
        privateEvidenceStore(),
      );
      if (
        !process.env.DATABASE_SCHEMA ||
        process.env.DATABASE_SCHEMA === "public"
      )
        void sweepOrphanEvidence().catch(() =>
          console.warn("PRIVATE_EVIDENCE_CLEANUP_FAILED"),
        );
      return result;
    },
    true,
  );
}
