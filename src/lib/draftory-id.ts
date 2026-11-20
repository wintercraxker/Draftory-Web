import { randomInt } from "node:crypto";

// 40 bits of independent randomness, without ambiguous I/O/0/1 characters.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newDraftoryId() {
  return (
    "DF-" +
    Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(
      "",
    )
  );
}
export function normalizeDraftoryId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^DF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(normalized)
    ? normalized
    : null;
}
