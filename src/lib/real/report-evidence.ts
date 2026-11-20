import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { AccountError } from "./http";

export const evidenceLimits = {
  count: 3,
  bytes: 5 * 1024 * 1024,
  pixels: 40000000,
} as const;
/** Contract for a PRIVATE object store, not a local disk or public bucket.
 * The R2 adapter uses staged metadata and the reference-aware orphan sweeper.
 * Report references remain immutable; unreferenced objects older than 24h are reclaimed. */
export interface PrivateEvidenceStore {
  stage(key: string, bytes: Uint8Array, expiresAt: Date): Promise<void>;
  commit(keys: string[], reportId: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}
export async function normalizeReportImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > evidenceLimits.bytes)
    throw new AccountError("La imagen debe pesar como máximo 5 MB.", 413);
  const b = Buffer.from(bytes);
  const format = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "jpeg"
      : b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP"
        ? "webp"
        : null;
  if (!format || mime !== `image/${format}`)
    throw new AccountError("Formato de imagen no permitido.");
  try {
    const image = sharp(b, {
      failOn: "warning",
      limitInputPixels: evidenceLimits.pixels,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw Error();
    // Decode/re-encode, remove metadata, preserve aspect ratio; never serve original bytes.
    return await image
      .rotate()
      .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    throw new AccountError(
      "Imagen inválida, animada o con dimensiones excesivas.",
    );
  }
}
export async function stageReportImages(
  store: PrivateEvidenceStore,
  files: { bytes: Uint8Array; type: string }[],
) {
  if (files.length > evidenceLimits.count)
    throw new AccountError("Puedes adjuntar hasta 3 imágenes.");
  const normalized = await Promise.all(
    files.map((file) => normalizeReportImage(file.bytes, file.type)),
  );
  const keys: string[] = [];
  try {
    for (const bytes of normalized) {
      const key = "report-evidence/" + randomUUID() + ".webp";
      keys.push(key);
      await store.stage(key, bytes, new Date(Date.now() + 86400000));
    }
    return keys;
  } catch (error) {
    await store.remove(keys).catch(() => {});
    throw error;
  }
}
