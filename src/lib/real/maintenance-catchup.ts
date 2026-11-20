import { after } from "next/server";
let nextAttempt = 0;
// Never a timer or an HTTP self-call. Only an authenticated, successful web
// operation schedules this work; the database also enforces a shared cooldown.
export function scheduleMaintenanceCatchup() {
  if (
    process.env.VERCEL_ENV !== "production" ||
    process.env.DRAFTORY_DEPLOYMENT_ENV !== "production" ||
    process.env.DRAFTORY_OPPORTUNISTIC_MAINTENANCE !== "true" ||
    process.env.DRAFTORY_MAINTENANCE === "true" ||
    Date.now() < nextAttempt
  )
    return;
  try {
    after(async () => {
      try {
        const { runMaintenanceTick } = await import("./maintenance");
        await runMaintenanceTick({ cooldown: true });
      } catch {
        console.warn("DRAFTORY_WEB_CATCHUP_UNAVAILABLE");
      }
    });
    nextAttempt = Date.now() + 15000;
  } catch {
    // Unit/repository callers outside a Next request have no after lifecycle.
    // The scheduled production cron remains an independent catch-up mechanism.
  }
}
