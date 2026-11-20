import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "../../generated/prisma/client";
import type { PrivateEvidenceStore } from "./report-evidence";
import { normalizeReportImage, evidenceLimits } from "./report-evidence";
import { AccountError } from "./errors";
import { requirePermission } from "./staff-access";
import { prisma } from "../prisma";
import { privateEvidenceStore, R2EvidenceStore } from "./r2-evidence-store";
export type StoredEvidenceImage = {
  kind: "image";
  key: string;
  sha256: string;
  mime: "image/webp";
  bytes: number;
  width: number;
  height: number;
};
export function isStoredImage(value: unknown): value is StoredEvidenceImage {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as StoredEvidenceImage).kind === "image" &&
    /^report-evidence\/[0-9a-f-]{36}\.webp$/.test(
      (value as StoredEvidenceImage).key,
    )
  );
}
export function evidenceFingerprint(value: unknown) {
  return JSON.stringify(
    Array.isArray(value)
      ? value.map((v) =>
          isStoredImage(v)
            ? {
                kind: v.kind,
                sha256: v.sha256,
                mime: v.mime,
                bytes: v.bytes,
                width: v.width,
                height: v.height,
              }
            : v,
        )
      : [],
  );
}
export function publicStaffEvidence(
  reportId: string,
  evidence: Prisma.JsonValue | null,
) {
  return Array.isArray(evidence)
    ? evidence.map((v, index) =>
        isStoredImage(v)
          ? ({
              kind: "image",
              mime: v.mime,
              bytes: v.bytes,
              width: v.width,
              height: v.height,
              src: `/api/staff/reports/${encodeURIComponent(reportId)}/evidence/${index}`,
            } as Prisma.JsonObject)
          : v,
      )
    : [];
}
export async function prepareEvidenceImages(
  files: { bytes: Uint8Array; type: string }[],
  store: PrivateEvidenceStore,
) {
  if (files.length > evidenceLimits.count)
    throw new AccountError("Puedes adjuntar hasta 3 imágenes.");
  const items: { reference: StoredEvidenceImage; bytes: Uint8Array }[] = [];
  for (const file of files) {
    const bytes = await normalizeReportImage(file.bytes, file.type),
      meta = await sharp(bytes).metadata();
    items.push({
      bytes,
      reference: {
        kind: "image",
        key: "report-evidence/" + randomUUID() + ".webp",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        mime: "image/webp",
        bytes: bytes.length,
        width: meta.width!,
        height: meta.height!,
      },
    });
  }
  try {
    for (const item of items)
      await store.stage(
        item.reference.key,
        item.bytes,
        new Date(Date.now() + 86400000),
      );
    await store.commit(
      items.map((i) => i.reference.key),
      "staged",
    );
    return items.map((i) => i.reference);
  } catch {
    await store.remove(items.map((i) => i.reference.key)).catch(() => {});
    throw new AccountError(
      "No se pudieron guardar las capturas privadas. Inténtalo de nuevo.",
      503,
    );
  }
}
export async function readPrivateReportImage(
  actorId: string,
  reportId: string,
  index: number,
  db = prisma,
  store?: PrivateEvidenceStore,
) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(reportId) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 5
  )
    throw new AccountError("Evidencia no disponible.", 404);
  const reference = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('draftory-staff-authorization'))`;
    await requirePermission(actorId, "reports.view", tx);
    if (
      (await tx.staffAuditLog.count({
        where: { actorId, createdAt: { gt: new Date(Date.now() - 60000) } },
      })) >= 90
    )
      throw new AccountError("Espera antes de consultar otra evidencia.", 429);
    const report = await tx.playerReport.findUnique({
      where: { id: reportId },
      select: { evidence: true },
    });
    const value = Array.isArray(report?.evidence)
      ? report.evidence[index]
      : null;
    if (!isStoredImage(value))
      throw new AccountError("Evidencia no disponible.", 404);
    await tx.staffAuditLog.create({
      data: {
        actorId,
        permission: "reports.view",
        action: "readReportImage",
        reason: "Consulta de evidencia privada",
        result: "SUCCESS",
        changes: { reportId, index },
      },
    });
    return value;
  });
  let bytes: Uint8Array;
  try {
    bytes = await (store ?? privateEvidenceStore()).read(reference.key);
  } catch {
    throw new AccountError("No se pudo cargar esta evidencia privada.", 503);
  }
  await requirePermission(actorId, "reports.view", db);
  return bytes;
}
let lastSweep = 0,
  sweepCursor: string | undefined;
export async function sweepOrphanEvidence(
  db = prisma,
  store = new R2EvidenceStore(),
  force = false,
) {
  if (
    store instanceof R2EvidenceStore &&
    process.env.DATABASE_SCHEMA &&
    process.env.DATABASE_SCHEMA !== "public"
  )
    throw new AccountError(
      "La limpieza real requiere el esquema p?blico.",
      403,
    );
  if (!force && Date.now() - lastSweep < 900000) return { removed: 0 };
  lastSweep = Date.now();
  let cursor = sweepCursor,
    removed = 0;
  for (let page = 0; page < 10; page++) {
    const result = await store.list(cursor);
    for (const object of result.Contents ?? []) {
      const key = object.Key;
      if (
        !key ||
        !/^report-evidence\/[0-9a-f-]{36}\.webp$/.test(key) ||
        !object.LastModified ||
        object.LastModified.getTime() > Date.now() - 86400000
      )
        continue;
      const report = await db.playerReport.findFirst({
        where: { evidence: { array_contains: [{ kind: "image", key }] } },
        select: { id: true },
      });
      if (!report) {
        await store.remove([key]);
        removed++;
      }
    }
    cursor = result.NextContinuationToken;
    if (!cursor) break;
  }
  sweepCursor = cursor;
  return { removed, more: Boolean(cursor) };
}
