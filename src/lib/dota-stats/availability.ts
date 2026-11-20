import type {
  DotaStatsDto,
  DotaProfileData,
  DotaWinLoss,
  StratzAnalytics,
} from "./types";
export type PublicAvailability =
  | "PUBLIC_DATA_AVAILABLE"
  | "PUBLIC_DATA_NOT_SHARED"
  | "PROVIDER_UNAVAILABLE"
  | "NOT_SYNCED"
  | "NO_DATA";
// Empty OpenDota results do not establish Dota sharing settings. Steam's
// explicit communityvisibilitystate=1 establishes only Steam profile privacy.
export function publicAvailability(
  profile: DotaStatsDto,
  winloss: DotaStatsDto,
  steamVisibility: number | null,
  analytics?: DotaStatsDto,
): PublicAvailability {
  const p = profile.data as DotaProfileData | null,
    w = winloss.data as DotaWinLoss | null;
  if (
    [profile, winloss].some(
      (v) =>
        v.errorReason &&
        !["NO_PUBLIC_DATA", "NOT_FOUND"].includes(v.errorReason),
    )
  )
    return "PROVIDER_UNAVAILABLE";
  if (p?.rank || p?.leaderboardRank || (w && w.games > 0))
    return "PUBLIC_DATA_AVAILABLE";
  // This is STRATZ's own explicit publication flag, not an inference about the
  // Dota checkbox. Never infer privacy from anonymous historical match players.
  if (
    analytics?.status === "available" &&
    analytics.lastSuccessAt &&
    (analytics.data as StratzAnalytics | null)?.isStratzPublic === false
  )
    return "PUBLIC_DATA_NOT_SHARED";
  const emptyAttempt = [profile, winloss].some(
    (v) => v.lastAttemptAt && v.errorReason === "NO_PUBLIC_DATA",
  );
  if (!profile.lastSuccessAt && !winloss.lastSuccessAt) {
    if (emptyAttempt) return "NO_DATA";
    return profile.lastAttemptAt || winloss.lastAttemptAt
      ? "PROVIDER_UNAVAILABLE"
      : "NOT_SYNCED";
  }
  void steamVisibility; // Steam privacy is not proof of Dota sharing settings.
  // No proof of privacy; successful empty data remains available, not fabricated.
  return "PUBLIC_DATA_AVAILABLE";
}
