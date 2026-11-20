"use client";
import { useEffect, useRef, useId, useState } from "react";
import { StaffButton } from "@/components/moderation/StaffUi";
import { ShieldAlert, ArrowRight, Check } from "lucide-react";
import { reportDecisions } from "@/lib/report-decisions";
import { sanctionCategories } from "@/lib/sanction-categories";
import { staffPermissionLabels } from "@/lib/moderation-presentation";
import type { ActionContext } from "@/components/moderation/StaffManagement";
const labels: Record<string, string> = {
  ban: "Suspender permanentemente",
  suspend: "Suspender temporalmente",
  mute: "Silenciar usuario",
  warn: "Registrar advertencia",
  revoke: "Revocar sanción",
  setRole: "Cambiar rol",
  setPermission: "Cambiar permiso",
  closeRoom: "Cerrar sala",
  kickRoom: "Retirar usuario",
  hideMessage: "Retirar mensaje",
  resolveReport: "Resolver reporte",
  assignReport: "Asignar reporte",
  cancelReportIntervention: "Cancelar intervención pendiente",
  verifyMedal: "Verificar medalla",
};
const consequences: Record<string, string> = {
  ban: "La cuenta perderá el acceso a nuevas participaciones y mensajes de forma permanente.",
  suspend:
    "La cuenta no podrá iniciar nuevas participaciones ni enviar mensajes durante la suspensión.",
  mute: "Se bloqueará el envío de mensajes hasta el vencimiento.",
  revoke:
    "Esta acción finalizará anticipadamente la sanción seleccionada. El historial permanecerá registrado.",
  kickRoom:
    "Se retirará al usuario de esta sala únicamente si su fase lo permite.",
  closeRoom:
    "Se cerrará la sala en espera. Las partidas activas no se alteran.",
  hideMessage:
    "El mensaje se retirará y su contenido original se conservará en la auditoría.",
  setRole:
    "Cambiará el acceso administrativo del usuario según el cargo seleccionado.",
  setPermission:
    "El cambio afectará a todos los miembros de este rol y conservará las restricciones de jerarquía.",
};
export function StaffConfirmation({
  payload,
  context,
  onCancel,
  onConfirm,
  busy = false,
  error = "",
}: {
  payload: Record<string, unknown>;
  context?: ActionContext;
  onCancel: () => void;
  onConfirm: (ownerConfirmed?: boolean) => void;
  busy?: boolean;
  error?: string;
}) {
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    title = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  const action = String(payload.action),
    danger =
      ["ban", "revoke", "kickRoom", "closeRoom", "hideMessage"].includes(
        action,
      ) ||
      (action === "setPermission" && !payload.allowed) ||
      (action === "setRole" && payload.role === "USER");
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby={title}
      className="staff-confirmation"
    >
      <div className="staff-modal-icon">
        <ShieldAlert size={24} />
      </div>
      <p className="dashboard-label">REVISIÓN DE LA OPERACIÓN</p>
      <h2 id={title}>{labels[action] ?? "Confirmar intervención"}</h2>
      <p className="staff-help">
        {context?.consequence ??
          consequences[action] ??
          "La operación se verificará en el servidor y quedará registrada en la auditoría."}
      </p>
      <dl>
        <div>
          <dt>Sobre</dt>
          <dd>
            {context?.target ??
              String(
                payload.userId ??
                  payload.role ??
                  payload.reportId ??
                  payload.roomId ??
                  "Registro seleccionado",
              )}
          </dd>
        </div>
        {payload.permission !== undefined && (
          <div>
            <dt>Capacidad</dt>
            <dd>
              {staffPermissionLabels[String(payload.permission)] ??
                String(payload.permission)}
            </dd>
          </div>
        )}
        {context?.before && context.after ? (
          <div>
            <dt>Cambio propuesto</dt>
            <dd className="staff-change-preview">
              <span>{context.before}</span>
              <ArrowRight size={15} />
              <strong>{context.after}</strong>
            </dd>
          </div>
        ) : (
          payload.role !== undefined && (
            <div>
              <dt>Rol</dt>
              <dd>{String(payload.role)}</dd>
            </div>
          )
        )}
        {typeof payload.endsAt === "string" && payload.endsAt && (
          <div>
            <dt>Finalización</dt>
            <dd>{new Date(payload.endsAt).toLocaleString("es-CO")}</dd>
          </div>
        )}
        {context?.reportedAccount && (
          <div>
            <dt>Cuenta denunciada</dt>
            <dd>{context.reportedAccount}</dd>
          </div>
        )}
        {context?.reviewer && (
          <div>
            <dt>Responsable de revisión</dt>
            <dd>{context.reviewer}</dd>
          </div>
        )}
        {context?.reportLabel && (
          <div>
            <dt>Reporte relacionado</dt>
            <dd>{context.reportLabel}</dd>
          </div>
        )}
        {payload.publicCategory !== undefined && (
          <div>
            <dt>Categoría</dt>
            <dd>
              {sanctionCategories[String(payload.publicCategory)] ??
                String(payload.publicCategory)}
            </dd>
          </div>
        )}
        {context?.durationPreview && (
          <div>
            <dt>Duración / finalización estimada</dt>
            <dd>{context.durationPreview}</dd>
          </div>
        )}
        {typeof payload.decision === "string" && (
          <div>
            <dt>Decisión del caso</dt>
            <dd>
              {reportDecisions[
                payload.decision as keyof typeof reportDecisions
              ] ?? payload.decision}
            </dd>
          </div>
        )}
        <div>
          <dt>Motivo</dt>
          <dd>{String(payload.publicReason ?? payload.resolution ?? "")}</dd>
        </div>
      </dl>
      {context?.ownerExceptionRequired && (
        <label className="staff-owner-exception">
          <input
            type="checkbox"
            checked={ownerConfirmed}
            onChange={(e) => setOwnerConfirmed(e.target.checked)}
            disabled={busy}
          />
          Estás involucrado en este reporte. Como propietario puedes continuar
          mediante una intervención excepcional. Esta acción quedará registrada
          en la auditoría. Confirmo que deseo continuar.
        </label>
      )}
      {error && (
        <p role="alert" className="staff-alert staff-alert--error">
          {error}
        </p>
      )}
      <p className="staff-modal-audit">
        <Check size={14} />
        Identidad, permiso y resultado quedarán auditados.
      </p>
      <div className="staff-form-actions">
        <StaffButton
          type="button"
          variant="quiet"
          disabled={busy}
          onClick={onCancel}
        >
          {["warn", "mute", "suspend", "ban", "revoke"].includes(action)
            ? "Cancelar"
            : "Volver"}
        </StaffButton>
        <StaffButton
          type="button"
          variant={danger ? "danger" : "primary"}
          loading={busy}
          disabled={Boolean(context?.ownerExceptionRequired && !ownerConfirmed)}
          onClick={() => onConfirm(ownerConfirmed)}
        >
          {busy
            ? "Procesando…"
            : action === "resolveReport"
              ? "Confirmar y resolver"
              : action === "revoke"
                ? "Confirmar revocación"
                : ["warn", "mute", "suspend", "ban"].includes(action)
                  ? "Confirmar intervención"
                  : "Confirmar y registrar"}
        </StaffButton>
      </div>
    </dialog>
  );
}
