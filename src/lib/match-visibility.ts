// Presentation policy, distinct from 5v5 progression eligibility. Solo Mid remains
// visible when it has a verified final result; operational attempts stay persisted.
export const completedHistoryWhere = {
  status: "COMPLETED" as const,
  verifiedAt: { not: null },
  winningSide: { not: null },
  finishedAt: { not: null },
};
export function completedHistoryMatch(match: {
  status: string;
  verifiedAt: unknown;
  winningSide: unknown;
  finishedAt: unknown;
}) {
  return (
    match.status === "COMPLETED" &&
    !!match.verifiedAt &&
    !!match.winningSide &&
    !!match.finishedAt
  );
}
export function visibleHistoryCard(match: {
  historyVisible?: boolean;
  status?: string;
  result?: string;
}) {
  return (
    match.historyVisible ??
    (!match.status ||
      (match.status === "COMPLETED" && match.result !== "Sin resultado"))
  );
}
