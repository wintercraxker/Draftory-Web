// EMatchOutcome from the pinned GC protobuf: 64..69 are explicitly NotScored.
// Neither roster absence nor elapsed time proves an external session ended.
export const unscoredOutcome = (value) =>
  Number.isInteger(value) && value >= 64 && value <= 69;
export function correlatedUnscoredPostgame(context, evidence) {
  return (
    evidence?.lobbyId === context.lobbyId &&
    evidence.ownerSteamId === context.worker.steamId &&
    evidence.gameMode === context.gameMode &&
    evidence.serverRegion === context.serverRegion &&
    evidence.stateCode === 3 &&
    /^[1-9]\d{0,19}$/.test(evidence.matchId ?? "") &&
    unscoredOutcome(evidence.matchOutcome)
  );
}
