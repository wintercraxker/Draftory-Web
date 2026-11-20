"use client";
import { useId, useState, type ComponentProps } from "react";
import { DashboardDialog } from "../dashboard/DashboardDialog";
import { StaffButton } from "./StaffUi";
import { SanctionForm } from "./SanctionForm";
import { X } from "lucide-react";
import { StaffIdentity } from "./StaffIdentity";

// Keep the form mounted while closed so reviewing, cancelling or retrying preserves the draft.
export function InterventionDialog(
  props: ComponentProps<typeof SanctionForm> & {
    disabled?: boolean;
    user?: ComponentProps<typeof StaffIdentity>["user"];
  },
) {
  const [open, setOpen] = useState(false),
    id = useId();
  return (
    <div className="staff-intervention-launcher">
      <StaffButton
        variant="primary"
        disabled={props.busy || props.disabled}
        onClick={() => setOpen(true)}
      >
        {props.reportId ? "Aplicar intervención" : "Registrar intervención"}
      </StaffButton>
      <DashboardDialog
        wide
        open={open}
        titleId={id}
        dismissible={!props.busy}
        onClose={() => setOpen(false)}
      >
        <section className="staff-intervention-dialog">
          <header className="staff-intervention-header">
            <div>
              <p className="staff-eyebrow">
                MODERACIÓN · {props.reportId ? "DESDE REPORTE" : "CUENTA"}
              </p>
              <h2 id={id}>Aplicar intervención</h2>
              <p>Registra una medida de moderación para este jugador.</p>
              <StaffIdentity
                user={props.user ?? { displayName: props.userName }}
                size={40}
              />
            </div>
            <StaffButton
              variant="quiet"
              aria-label="Cerrar intervención"
              disabled={props.busy}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </StaffButton>
          </header>
          <SanctionForm
            {...props}
            onCancel={() => setOpen(false)}
            onAction={(payload, context) =>
              props.onAction(payload, {
                ...context,
                onSuccess: () => {
                  setOpen(false);
                  context?.onSuccess?.();
                },
              })
            }
          />
        </section>
      </DashboardDialog>
    </div>
  );
}
