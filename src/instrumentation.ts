export async function register() {
  if (
    process.env.VERCEL === "1" ||
    process.env.DRAFTORY_BACKGROUND_MODE === "external" ||
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
    return;
  // The dev multiplayer server must never run a sweeper against the web's DATABASE_URL.
  if (
    process.env.DRAFTORY_MULTIPLAYER_DEV_SERVER === "true" ||
    process.env.DRAFTORY_MULTIPLAYER_TEST_RUN === "true"
  )
    return;
  const { startReadySweeper } = await import("./lib/real/ready-sweeper");
  startReadySweeper();
  const { startPresenceSweeper } = await import("./lib/real/room-presence");
  startPresenceSweeper();
  const { startResultSweeper } = await import("./lib/real/result-sweeper");
  startResultSweeper();
}
