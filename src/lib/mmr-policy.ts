export const mmrStates = [
  "UNVERIFIED",
  "UNDER_REVIEW",
  "VERIFIED",
  "NEEDS_UPDATE",
  "REJECTED",
] as const;
export type MmrState = (typeof mmrStates)[number];
export function mmrMaximum(value = process.env.DRAFTORY_MMR_MAX) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 10000 && n <= 30000 ? n : 20000;
}
export function validateMmr(value: unknown, maximum = mmrMaximum()): number {
  // Form strings are canonical decimal digits; JSON numbers must be safe integers.
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^(0|[1-9][0-9]{0,4})$/.test(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) <= 0 ||
    Number(value) > maximum
  )
    throw new Error(`Introduce un MMR entero entre 1 y ${maximum}.`);
  return Number(value);
}
export const mmrLabels: Record<MmrState, string> = {
  UNVERIFIED: "Pendiente de verificación",
  UNDER_REVIEW: "En revisión",
  VERIFIED: "Verificado",
  NEEDS_UPDATE: "Requiere actualización",
  REJECTED: "Rechazado",
};
export type OperationalMmr = {
  value: number | null;
  verified: boolean;
  status: MmrState;
  revision: number;
};
