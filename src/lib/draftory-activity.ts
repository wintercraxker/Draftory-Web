export function activityCounts(
  rows: { date: string; count: number }[],
  now: string,
  days: number,
) {
  const today = Date.parse(now.slice(0, 10) + "T00:00:00Z");
  const counts = Array<number>(7).fill(0);
  for (const row of rows) {
    const age = Math.round(
      (today - Date.parse(row.date + "T00:00:00Z")) / 86400000,
    );
    if (age >= 0 && age < days)
      counts[Math.min(6, Math.floor(((days - 1 - age) * 7) / days))] +=
        row.count;
  }
  return counts;
}
