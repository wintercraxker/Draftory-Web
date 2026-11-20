"use client";
import { durationLabel } from "@/lib/sanction-duration";
import { useState } from "react";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { StaffButton } from "./StaffUi";
import {
  SanctionDuration,
  durationPayload,
  initialDuration,
} from "./SanctionDuration";
import { sanctionCategories } from "@/lib/sanction-categories";
import type { ActionContext } from "./StaffManagement";
export const interventionLabels: Record<string, string> = {
  warn: "Advertencia",
  mute: "Silencio temporal",
  suspend: "Suspensión temporal",
  ban: "Suspensión permanente",
};
export type SanctionDraft = {
  choice: string;
  reason: string;
  category: string;
  note: string;
  duration: typeof initialDuration;
};
export function SanctionForm({
  userId,
  userName,
  actions,
  busy,
  onAction,
  serverNow,
  moderator = false,
  reportId,
  reportTitle,
  ownerExceptionRequired = false,
  onCancel,
  draft,
  onDraftChange,
}: {
  userId: string;
  userName: string;
  actions: string[];
  busy: boolean;
  onAction: (v: Record<string, unknown>, c?: ActionContext) => Promise<void>;
  serverNow: string;
  moderator?: boolean;
  reportId?: string;
  reportTitle?: string;
  ownerExceptionRequired?: boolean;
  onCancel?: () => void;
  draft?: SanctionDraft;
  onDraftChange?: (draft: SanctionDraft) => void;
}) {
  const [localDraft, setLocalDraft] = useState<SanctionDraft>({
    choice: actions[0] ?? "",
    reason: "",
    category: "COMMUNITY_RULES",
    note: "",
    duration: initialDuration,
  });
  const state = draft ?? localDraft;
  const { choice, reason, category, note, duration } = state;
  const change = (patch: Partial<SanctionDraft>) => {
    const next = { ...state, ...patch };
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  };
  const action = actions.includes(choice) ? choice : actions[0],
    timed = action === "mute" || action === "suspend",
    value = durationPayload(duration);
  const minutes =
    value &&
    ("durationMinutes" in value
      ? value.durationMinutes
      : (Date.parse("endsAt" in value ? value.endsAt : "") -
          Date.parse(serverNow)) /
        60000);
  const valid = Boolean(
    !timed ||
    (minutes && minutes > 0 && minutes <= (moderator ? 7 : 366) * 1440),
  );
  return (
    <form
      className="staff-intervention-form"
      data-managed-drafts
      onSubmit={(e) => {
        e.preventDefault();
        if (!action || !valid || reason.trim().length < 3) return;
        void onAction(
          {
            action,
            userId,
            publicReason: reason,
            publicCategory: category,
            internalNote: note,
            ...(timed ? value : {}),
            ...(reportId ? { reportId } : {}),
          },
          {
            target: userName,
            reportedAccount: reportId ? userName : undefined,
            reportLabel: reportTitle,
            ownerExceptionRequired,
            durationPreview:
              timed && value
                ? "durationMinutes" in value
                  ? `${durationLabel(value.durationMinutes)} · ${new Date(Date.parse(serverNow) + value.durationMinutes * 60000).toLocaleString("es-CO")} (estimada)`
                  : new Date(
                      "endsAt" in value ? value.endsAt : "",
                    ).toLocaleString("es-CO")
                : undefined,
            consequence:
              "Se registrará la intervención y se notificará al jugador. El reporte no se resolverá automáticamente.",
          },
        );
      }}
    >
      <label className="staff-field">
        Tipo de intervención
        <DashboardDropdown
          fullWidth
          className="staff-select"
          label="Tipo de intervención"
          value={action ?? ""}
          options={actions.map((a) => ({
            value: a,
            label: interventionLabels[a] ?? a,
          }))}
          onChange={(choice) => change({ choice })}
          disabled={busy}
        />
      </label>

      <label className="staff-field">
        Motivo
        <textarea
          name="publicReason"
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(e) => change({ reason: e.target.value })}
          placeholder="Motivo obligatorio comunicado al jugador"
        />
      </label>
      <label className="staff-field">
        Categoría pública
        <DashboardDropdown
          fullWidth
          className="staff-select"
          label="Categoría pública"
          value={category}
          onChange={(category) => change({ category })}
          options={Object.entries(sanctionCategories).map(([value, label]) => ({
            value,
            label,
          }))}
          disabled={busy}
        />
      </label>
      {timed && (
        <SanctionDuration
          value={duration}
          onChange={(duration) => change({ duration })}
          serverNow={serverNow}
          maxMinutes={(moderator ? 7 : 366) * 1440}
        />
      )}
      <details className="staff-internal-note">
        <summary>Nota interna opcional</summary>
        <label className="staff-field">
          Solo para Staff autorizado
          <textarea
            name="internalNote"
            maxLength={2000}
            value={note}
            onChange={(e) => change({ note: e.target.value })}
          />
        </label>
      </details>
      <div className="staff-intervention-summary">
        <strong>Resumen de la intervención</strong>
        <p>
          {interventionLabels[action] ?? "Selecciona un tipo"} · {userName}
        </p>
        <small>
          {reportId
            ? `Vinculada al caso: ${reportTitle}`
            : "Registro directo en el historial del jugador."}{" "}
          No se aplicará hasta la confirmación final.
        </small>
      </div>
      <footer className="staff-intervention-footer">
        {onCancel && (
          <StaffButton type="button" disabled={busy} onClick={onCancel}>
            Cancelar
          </StaffButton>
        )}
        <StaffButton
          type="submit"
          variant="primary"
          disabled={!action || !valid || reason.trim().length < 3}
          loading={busy}
        >
          Revisar intervención
        </StaffButton>
      </footer>
    </form>
  );
}
