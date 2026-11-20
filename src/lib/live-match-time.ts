import { gameplayConfirmed } from "./dota-start-evidence";
type StartEvidence = {
  status: string;
  dotaMatchId: string | null;
  control: {
    status: string;
    externalMatchId: string | null;
    consumedAt: Date | null;
    warningJournal: unknown;
  } | null;
};
// RUN observation time is not game_start_time. Never write a guessed Match.startedAt.
export function confirmedLiveStart(
  input: StartEvidence,
  serverNow: number,
): string | null {
  const c = input.control;
  const lifecycle = (
    c?.warningJournal as {
      LIFECYCLE?: {
        source?: string;
        state?: string;
        externalMatchId?: string;
        gameStartTime?: number;
      };
    } | null
  )?.LIFECYCLE;
  const seconds = lifecycle?.gameStartTime;
  if (
    !gameplayConfirmed(c, input.dotaMatchId, serverNow) ||
    input.status !== "IN_PROGRESS" ||
    c?.status !== "STARTED" ||
    !input.dotaMatchId ||
    c.externalMatchId !== input.dotaMatchId ||
    lifecycle?.externalMatchId !== input.dotaMatchId ||
    lifecycle.source !== "GC" ||
    lifecycle.state !== "RUN" ||
    !c.consumedAt ||
    !Number.isSafeInteger(seconds) ||
    seconds! <= 0
  )
    return null;
  const ms = seconds! * 1000;
  if (
    ms < c.consumedAt.getTime() - 1000 ||
    ms > serverNow ||
    !Number.isSafeInteger(ms)
  )
    return null;
  return new Date(ms).toISOString();
}
export function elapsedMatchTime(start: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
