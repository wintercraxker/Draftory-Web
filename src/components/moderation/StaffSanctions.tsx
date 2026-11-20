"use client";
import { StaffIdentity } from "./StaffIdentity";
import { StaffButton, StaffEmpty } from "./StaffUi";
import { sanctionKindLabels } from "@/lib/moderation-presentation";
import type { StaffFeed, ActionContext } from "./StaffManagement";

function SanctionDate({
  value,
  empty = "Sin vencimiento",
}: {
  value?: Date | string | null;
  empty?: string;
}) {
  if (!value) return <span className="staff-help">{empty}</span>;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return <span>Fecha no disponible</span>;
  return (
    <time
      dateTime={d.toISOString()}
      className="staff-sanction-date"
      title="Hora de Bogotá (UTC−5)"
    >
      <span>
        {d.toLocaleDateString("es-CO", {
          timeZone: "America/Bogota",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>
      <small>
        {d.toLocaleTimeString("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · UTC−5
      </small>
    </time>
  );
}
export function StaffSanctions({
  rows,
  busy,
  canRevoke,
  onAction,
  now,
}: {
  rows: StaffFeed["sanctions"];
  busy: boolean;
  canRevoke: boolean;
  now: string;
  onAction: (
    payload: Record<string, unknown>,
    context?: ActionContext,
  ) => void | Promise<unknown>;
}) {
  return (
    <section className="staff-sanctions" aria-label="Historial de sanciones">
      <table>
        <colgroup>
          {[19, 20, 19, 11, 11, 11, 9].map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {[
              "Usuario",
              "Sanción",
              "Motivo",
              "Aplicación",
              "Vencimiento",
              "Estado",
              "Acciones",
            ].map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const state =
              s.state === "REVOKED"
                ? "Revocada"
                : s.endsAt && new Date(s.endsAt).getTime() <= Date.parse(now)
                  ? "Expirada"
                  : "Activa";
            return (
              <tr key={s.id} data-record-id={s.id}>
                <td data-label="Usuario">
                  <StaffIdentity user={s.user} />
                </td>
                <td data-label="Sanción">
                  <div className="staff-sanction-measure">
                    <strong className="staff-sanction-kind">
                      {sanctionKindLabels[s.kind] ?? s.kind}
                    </strong>
                    <div className="staff-sanction-applied-by">
                      <span className="staff-help">Aplicada por:</span>
                      <StaffIdentity user={s.admin} size={28} />
                    </div>
                  </div>
                </td>
                <td data-label="Motivo">
                  <details className="staff-sanction-reason">
                    <summary>
                      <span>{s.publicReason}</span>
                      <small>Consultar motivo completo</small>
                    </summary>
                    <p>{s.publicReason}</p>
                  </details>
                </td>
                <td data-label="Aplicación">
                  <SanctionDate value={s.startsAt} />
                </td>
                <td data-label="Vencimiento">
                  <SanctionDate
                    value={s.endsAt}
                    empty={
                      s.kind === "WARNING"
                        ? "No corresponde"
                        : "Sin vencimiento"
                    }
                  />
                </td>
                <td data-label="Estado">
                  <span className="staff-status" data-state={state}>
                    {state}
                  </span>
                  {s.revokedAt && (
                    <details className="staff-sanction-revocation">
                      <summary>Ver revocación</summary>
                      <p>
                        {s.revokedBy?.displayName ??
                          s.revokedBy?.username ??
                          "Staff"}
                      </p>
                      <SanctionDate value={s.revokedAt} />
                    </details>
                  )}
                </td>
                <td data-label="Acciones">
                  {s.canRevoke && canRevoke ? (
                    <details className="staff-sanction-action">
                      <summary className="staff-button staff-button--danger">
                        Revocar
                      </summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void onAction(
                            {
                              action: "revoke",
                              sanctionId: s.id,
                              userId: s.userId,
                              publicReason: new FormData(e.currentTarget).get(
                                "reason",
                              ),
                            },
                            {
                              target: s.user.displayName ?? s.user.username,
                              reportLabel: s.reportId ?? undefined,
                            },
                          );
                        }}
                      >
                        <label>
                          Motivo de revocación
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={500}
                            className="staff-input"
                            placeholder="Explica el motivo"
                            disabled={busy}
                          />
                        </label>
                        <StaffButton
                          variant="danger"
                          disabled={busy}
                          type="submit"
                        >
                          Revisar revocación
                        </StaffButton>
                      </form>
                    </details>
                  ) : (
                    <span className="staff-help">Sin acciones disponibles</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <StaffEmpty>Sin sanciones registradas.</StaffEmpty>}
    </section>
  );
}
