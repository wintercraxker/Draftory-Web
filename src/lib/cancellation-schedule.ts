type Progress = {
  state?: string;
  checkedAt?: unknown;
  obtainedAt?: unknown;
  nextAt?: unknown;
  attempts?: number;
};
const iso = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
export function cancellationSchedule(
  reconciliation: Progress | undefined,
  details: Progress | undefined,
  workerFresh: boolean,
  now = Date.now(),
) {
  const lastCheckedAt = iso(reconciliation?.checkedAt ?? details?.obtainedAt);
  // Explicit null belongs to the newest administrative decision. It must not
  // revive an abandoned nextAt from a previous worker generation.
  const next = iso(reconciliation ? reconciliation.nextAt : details?.nextAt);
  const manual = [
    "ADMINISTRATIVE_READ_INCONCLUSIVE",
    "INTERVENTION_REQUIRED",
  ].includes(reconciliation?.state ?? "");
  const scheduled =
    !manual &&
    workerFresh &&
    next !== null &&
    Date.parse(next) > now &&
    (!lastCheckedAt || Date.parse(next) > Date.parse(lastCheckedAt));
  return {
    lastCheckedAt,
    nextCheckAt: scheduled ? next : null,
    requiresIntervention: manual || !workerFresh || (!!next && !scheduled),
  };
}
