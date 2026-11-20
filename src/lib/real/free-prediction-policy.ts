export const FREE_FORECAST_WINDOW_MS = 5 * 60 * 1000;
export function forecastWindow(
  match: {
    status: string;
    startedAt: Date | null;
    predictionsCloseAt: Date | null;
    dotaMatchId: string | null;
    winningSide: string | null;
    verifiedAt: Date | null;
    mode: string;
    players: { teamSide: string; userId: string }[];
    room: { isPrivate: boolean } | null;
    externalLink: { dotaMatchId: string } | null;
    launchControl: {
      status: string;
      externalMatchId: string | null;
      startedObservedAt: Date | null;
      warningJournal: unknown;
    } | null;
  },
  userId: string,
  now: Date,
) {
  const size =
    match.mode === "ONE_V_ONE_MID"
      ? 2
      : ["ALL_PICK", "CAPTAINS_MODE", "TURBO"].includes(match.mode)
        ? 10
        : 0;
  const started = match.startedAt?.getTime(),
    control = match.launchControl;
  const closesAt =
    started === undefined
      ? null
      : new Date(
          Math.min(
            started + FREE_FORECAST_WINDOW_MS,
            match.predictionsCloseAt?.getTime() ?? Infinity,
          ),
        );
  const journal = control?.warningJournal as {
    LIFECYCLE?: { state?: string };
    GC_DETAILS?: { snapshot?: { match_outcome?: number } };
  } | null;
  const terminal =
    journal?.LIFECYCLE?.state === "POSTGAME" ||
    [2, 3, 4, 5, 64, 65, 66, 67, 68, 69].includes(
      journal?.GC_DETAILS?.snapshot?.match_outcome ?? -1,
    );
  const eligible =
    !!size &&
    !!match.room &&
    !match.room.isPrivate &&
    match.status === "IN_PROGRESS" &&
    !match.winningSide &&
    !match.verifiedAt &&
    !terminal &&
    !!started &&
    started <= now.getTime() &&
    !!closesAt &&
    now < closesAt &&
    control?.status === "STARTED" &&
    !!control.startedObservedAt &&
    control.startedObservedAt <= now &&
    !!match.dotaMatchId &&
    control.externalMatchId === match.dotaMatchId &&
    match.externalLink?.dotaMatchId === match.dotaMatchId &&
    match.players.length === size &&
    match.players.filter((p) => p.teamSide === "RADIANT").length === size / 2 &&
    match.players.filter((p) => p.teamSide === "DIRE").length === size / 2 &&
    !match.players.some((p) => p.userId === userId);
  return { eligible, closesAt };
}
