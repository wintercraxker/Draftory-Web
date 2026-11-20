// Departure observed in SQL is not the final private marker commit.
// Aliases are internal SQL identifiers, never request input.
export function cancellationCommitCondition(alias = "j") {
  if (!/^[a-z][a-z_]*$/.test(alias)) throw Error("INVALID_CAPACITY_ALIAS");
  return `${alias}.kind='CANCEL_LOBBY' AND ${alias}.status='SUCCEEDED' AND ${alias}."errorCode" IN ('DISCONNECTED','ATTEMPTS_EXHAUSTED')`;
}
export function pendingCancellationCommitSql(worker) {
  if (!/^(?:[a-z]+\.id|\$[1-9][0-9]*)$/.test(worker))
    throw Error("INVALID_CAPACITY_WORKER");
  return `EXISTS(SELECT 1 FROM "DotaJob" pending_cancel WHERE pending_cancel."workerId"=${worker} AND ${cancellationCommitCondition("pending_cancel")})`;
}
