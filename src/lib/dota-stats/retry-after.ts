// Retry-After is either delta-seconds or an HTTP date, not a guessed delay.
export function retryAfterMs(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value?.trim()) return null;
  const input = value.trim();
  const delay = /^\d+$/.test(input)
    ? Number(input) * 1000
    : /^[A-Za-z]{3}, /.test(input)
      ? Date.parse(input) - now
      : NaN;
  return Number.isSafeInteger(delay) ? Math.max(1000, delay) : null;
}
