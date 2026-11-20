type Control = {
  status: string;
  externalMatchId?: string | null;
  consumedAt: Date | null;
  warningJournal: unknown;
};
export type DotaLifecycle = {
  source?: string;
  state?: string;
  externalMatchId?: string;
  lastSeenAt?: string;
  gameState?: number;
  serverAssigned?: boolean;
  gameStartTime?: number;
};
export function dotaLifecycle(
  control: Control | null | undefined,
): DotaLifecycle | undefined {
  return (control?.warningJournal as { LIFECYCLE?: DotaLifecycle } | null)
    ?.LIFECYCLE;
}
// Lobby RUN means a server association, including loading. Only the explicit
// GAME_IN_PROGRESS game state with a server and a fresh correlated GC object
// authorizes the live presentation. Neither this projection nor timeouts free capacity.
export function gameplayConfirmed(
  control: Control | null | undefined,
  matchId: string | null,
  now: number,
): boolean {
  const life = dotaLifecycle(control),
    seen = Date.parse(life?.lastSeenAt ?? "");
  return (
    !!control &&
    control.status === "STARTED" &&
    !!matchId &&
    control.externalMatchId === matchId &&
    life?.externalMatchId === matchId &&
    life.source === "GC" &&
    life.state === "RUN" &&
    life.gameState === 5 &&
    life.serverAssigned === true &&
    !!control.consumedAt &&
    seen >= control.consumedAt.getTime() &&
    now >= seen &&
    now - seen < 30000
  );
}
