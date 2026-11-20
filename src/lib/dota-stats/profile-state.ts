import type {
  DotaProfileBundle,
  DotaWinLoss,
  DotaHero,
  DotaPlayerStats,
} from "./types";
export type ProfileDataState =
  | "AVAILABLE"
  | "STALE"
  | "FIRST_SYNC_PENDING"
  | "NOT_PUBLIC"
  | "NO_DATA"
  | "TECHNICAL_ERROR"
  | "PRIVATE_DRAFTORY";
export function profileDataState(
  bundle: DotaProfileBundle,
  privateDraftory = false,
): ProfileDataState {
  if (privateDraftory) return "PRIVATE_DRAFTORY";
  const { profile, winloss, heroes, performance } = bundle;
  const w = winloss.data as DotaWinLoss | null,
    h = heroes.data as DotaHero[] | null,
    p = performance.data as DotaPlayerStats | null;
  const useful = !!(
    w?.games ||
    h?.length ||
    (p &&
      (p.kda !== null ||
        p.goldPerMinute !== null ||
        p.experiencePerMinute !== null))
  );
  const rows = [profile, winloss, heroes, performance];
  const failed = rows.some(
    (r) =>
      r.errorReason && !["NO_PUBLIC_DATA", "NOT_FOUND"].includes(r.errorReason),
  );
  if (useful)
    return failed || rows.some((r) => r.status === "stale")
      ? "STALE"
      : "AVAILABLE";
  if (bundle.manualSync.syncing) return "FIRST_SYNC_PENDING";
  if (failed || bundle.manualSync.interrupted) return "TECHNICAL_ERROR";
  if (bundle.privacyEvidence === "STRATZ_PROFILE_NOT_PUBLIC")
    return "NOT_PUBLIC";
  return "NO_DATA";
}
