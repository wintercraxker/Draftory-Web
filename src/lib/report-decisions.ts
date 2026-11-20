// Presentation classifications are recorded with the existing resolution audit entry.
// None of these values applies a sanction or changes the original evidence.
export const reportDecisions = {
  CONFIRMED: "Infracción confirmada",
  INSUFFICIENT: "Evidencia insuficiente",
  NO_VIOLATION: "No se encontró infracción",
  CONFLICT_RESOLVED: "Conflicto resuelto",
  IMPROPER: "Reporte improcedente",
  OTHER: "Otro motivo",
} as const;
