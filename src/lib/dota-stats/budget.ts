import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { DotaProviderName } from "./types";

// Application ceilings, not promises about a provider/token quota. No paid overage.
export const providerLimits = {
  VALVE: { second: 1, minute: 20, hour: 200, day: 500 },
  OPENDOTA: { second: 6, minute: 45, hour: 1800, day: 2400 },
  STRATZ: { second: 2, minute: 60, hour: 1000, day: 5000 },
} as const;
export async function reserveProviderBudget(
  tx: Prisma.TransactionClient,
  provider: DotaProviderName | "VALVE",
  now: Date,
) {
  const at = (ms: number) => new Date(Math.floor(now.getTime() / ms) * ms);
  await tx.$executeRaw`INSERT INTO "DotaApiBudget" (provider,"minuteStart","dayStart") VALUES (${provider},${at(60000)},${at(86400000)}) ON CONFLICT (provider) DO NOTHING`;
  await tx.$queryRaw`SELECT provider FROM "DotaApiBudget" WHERE provider = ${provider} FOR UPDATE`;
  const b = await tx.dotaApiBudget.findUniqueOrThrow({ where: { provider } }),
    limits = providerLimits[provider];
  const second = at(1000),
    minute = at(60000),
    hour = at(3600000),
    day = at(86400000);
  const s = b.secondStart?.getTime() === second.getTime() ? b.secondCount : 0;
  const m = b.minuteStart.getTime() === minute.getTime() ? b.minuteCount : 0;
  const h = b.hourStart?.getTime() === hour.getTime() ? b.hourCount : 0;
  const d = b.dayStart.getTime() === day.getTime() ? b.dayCount : 0;
  if (
    (b.blockedUntil && b.blockedUntil > now) ||
    s >= limits.second ||
    m >= limits.minute ||
    h >= limits.hour ||
    d >= limits.day
  )
    return false;
  await tx.dotaApiBudget.update({
    where: { provider },
    data: {
      secondStart: second,
      secondCount: s + 1,
      minuteStart: minute,
      minuteCount: m + 1,
      hourStart: hour,
      hourCount: h + 1,
      dayStart: day,
      dayCount: d + 1,
    },
  });
  return true;
}
