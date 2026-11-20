// Virtual, non-purchasable/non-transferable Draftory points. No cash conversion.
export const predictionPointsPolicy = {
  id: "DRAFTORY_POINTS_V1",
  minimum: 1,
  maximum: 100000,
  oddsNumerator: 18,
  oddsDenominator: 10,
  oddsLabel: "1,80",
} as const;
export function predictionAmount(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return null;
  const amount = BigInt(value);
  return amount >= BigInt(predictionPointsPolicy.minimum) &&
    amount <= BigInt(predictionPointsPolicy.maximum)
    ? amount
    : null;
}
// Wallet units are integers. Existing database contract floors fractions, never rounds up.
export function predictionReturn(amount: bigint) {
  return (
    (amount * BigInt(predictionPointsPolicy.oddsNumerator)) /
    BigInt(predictionPointsPolicy.oddsDenominator)
  );
}
