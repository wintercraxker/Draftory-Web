"use client";
import type { staffReports } from "@/lib/real/staff-repository";
import { StaffIdentity } from "./StaffIdentity";
import { sanctionKindLabels as names } from "@/lib/moderation-presentation";
export function ReportInterventions({
  report,
}: {
  report: Awaited<ReturnType<typeof staffReports>>["items"][number];
}) {
  if (!report.canViewHistory) return null;
  const render = (s: (typeof report.linkedSanctions)[number]) => (
    <details key={s.id} className="staff-linked-sanction">
      <summary>
        <span>{names[s.kind] ?? s.kind}</span>
        <span className="staff-status">
          {s.state === "REVOKED"
            ? "Revocada"
            : s.endsAt && new Date(s.endsAt) <= new Date()
              ? "Vencida"
              : "Activa"}
        </span>
      </summary>
      <p>{s.publicReason}</p>
      <StaffIdentity user={s.admin} size={26} detail="Registrada por" />
      <p className="staff-help">
        Aplicada: {new Date(s.startsAt).toLocaleString("es-CO")}
        <br />
        Finalización:{" "}
        {s.endsAt ? new Date(s.endsAt).toLocaleString("es-CO") : "Permanente"}
      </p>
      {s.revokedAt && (
        <p className="staff-help">
          Revocada por{" "}
          {s.revokedBy?.displayName ?? s.revokedBy?.username ?? "Staff"} el{" "}
          {new Date(s.revokedAt).toLocaleString("es-CO")}
        </p>
      )}
      <small>ID de intervención: {s.id}</small>
    </details>
  );
  return (
    <>
      <section className="staff-case-section">
        <h3>Intervención aplicada</h3>
        {report.linkedSanctions.map(render)}
        {!report.linkedSanctions.length && (
          <p className="staff-help">
            {report.resolutionOutcome === "NO_SANCTION"
              ? "Caso resuelto sin sanción."
              : report.status === "OPEN"
                ? "Todavía no hay intervenciones vinculadas a este caso."
                : "No hay intervenciones vinculadas registradas. No se infiere una decisión histórica."}
          </p>
        )}
      </section>
      <details className="staff-case-section">
        <summary>Historial de sanciones del jugador · últimas 20</summary>
        {report.sanctionHistory.map(render)}
        {!report.sanctionHistory.length && (
          <p className="staff-help">No hay sanciones registradas.</p>
        )}
      </details>
    </>
  );
}
