export function levelBadge(level?: number | null): string | null {
  if (!Number.isSafeInteger(level) || (level ?? 0) < 1) return null;
  return `/Plus_Hero_Badge_${Math.min(6, Math.ceil(level! / 10))}.webp`;
}
