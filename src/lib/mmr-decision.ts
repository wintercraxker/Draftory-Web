// Presentation decisions map onto the existing server commands; no new permission.
export type MmrDecision =
  "approve" | "correct" | "review" | "reject" | "revoke" | "update" | "note";
export const mmrDecisionLabels: Record<
  MmrDecision,
  { title: string; submit: string }
> = {
  approve: { title: "Aprobación de MMR", submit: "Confirmar aprobación" },
  correct: { title: "Corrección de MMR", submit: "Confirmar corrección" },
  review: { title: "Iniciar revisión", submit: "Iniciar revisión" },
  reject: { title: "Rechazar declaración", submit: "Confirmar rechazo" },
  revoke: { title: "Revocar verificación", submit: "Confirmar revocación" },
  update: { title: "Solicitar actualización", submit: "Enviar solicitud" },
  note: { title: "Registrar observación", submit: "Guardar observación" },
};
export const mmrDecisionCommand = (decision: MmrDecision) =>
  decision === "correct" ? "approve" : decision;
