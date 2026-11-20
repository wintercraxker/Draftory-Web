import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./errors";
import { requirePermission } from "./staff-access";

type Db = Prisma.TransactionClient;
export const sanctionActions = ["warn", "mute", "suspend", "ban"];
export const sanctionPermission: Record<
  string,
  "users.warn" | "users.mute" | "users.suspend" | "users.ban"
> = {
  warn: "users.warn",
  mute: "users.mute",
  suspend: "users.suspend",
  ban: "users.ban",
};
export function interventionFingerprint(
  v: Record<string, unknown>,
  action: string,
) {
  return JSON.stringify([
    action,
    ...[
      "userId",
      "reportId",
      "publicReason",
      "publicCategory",
      "internalNote",
      "durationMinutes",
      "endsAt",
      "ownerExceptionConfirmed",
    ].map((k) => v[k] ?? null),
  ]);
}
export async function lockedReport(
  tx: Db,
  actorId: string,
  role: string,
  id: string,
  confirmed: unknown,
  assigned = true,
) {
  await tx.$queryRaw`SELECT id FROM "PlayerReport" WHERE id=${id} FOR UPDATE`;
  const row = await tx.playerReport.findUnique({ where: { id } });
  if (!row)
    throw new AccountError("El reporte no existe o no está disponible.", 404);
  if (row.status !== "OPEN")
    throw new AccountError("El reporte ya fue resuelto.", 409);
  const involved = row.reporterId === actorId || row.reportedUserId === actorId;
  if (involved && (role !== "OWNER" || confirmed !== true))
    throw new AccountError(
      role === "OWNER"
        ? "Debes confirmar expresamente la intervención excepcional como propietario."
        : "Otro miembro del Staff debe revisar este reporte: eres una de las personas involucradas.",
      403,
    );
  if (row.assignedToId && row.assignedToId !== actorId)
    throw new AccountError(
      "Este reporte ya fue asignado a otro miembro del Staff.",
      409,
    );
  if (assigned && row.assignedToId !== actorId)
    throw new AccountError(
      "Debes asignarte el reporte antes de intervenir o resolverlo.",
      409,
    );
  await requirePermission(actorId, "reports.resolve", tx);
  return { row, exception: involved };
}
export async function reportInterventionState(tx: Db, id: string) {
  const records = await tx.staffAuditLog.findMany({
    where: {
      action: {
        in: [
          "prepareReportIntervention",
          "cancelReportIntervention",
          ...sanctionActions,
        ],
      },
      result: { in: ["SUCCESS", "REJECTED"] },
      changes: { path: ["reportId"], equals: id },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { actorId: true, action: true, result: true, changes: true },
  });
  const intent = records.find(
    (r) => r.action === "prepareReportIntervention" && r.result === "SUCCESS",
  );
  if (!intent)
    return {
      state: "NONE" as const,
      id: null,
      actorId: null,
      fingerprint: null,
    };
  const data = intent.changes as Record<string, Prisma.JsonValue>,
    key = String(data.interventionId);
  const events = records.filter(
    (r) =>
      r.actorId === intent.actorId &&
      (r.changes as Record<string, Prisma.JsonValue>)?.interventionId === key,
  );
  const complete = events.find(
    (r) => sanctionActions.includes(r.action) && r.result === "SUCCESS",
  );
  const cancel = events.find(
    (r) => r.action === "cancelReportIntervention" && r.result === "SUCCESS",
  );
  const fail = events.find(
    (r) => sanctionActions.includes(r.action) && r.result === "REJECTED",
  );
  return {
    state: complete
      ? ("COMPLETE" as const)
      : cancel
        ? ("CANCELLED" as const)
        : fail
          ? ("FAILED" as const)
          : ("PENDING" as const),
    id: key,
    actorId: intent.actorId,
    fingerprint: String(data.fingerprint),
  };
}
