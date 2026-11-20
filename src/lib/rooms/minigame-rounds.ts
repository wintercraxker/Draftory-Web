import type { MinigameSnapshot } from "./minigame";

// Round orchestration only. The injected transport owns and validates dice.
export async function resolveClassicDiceTies(
  snapshot: MinigameSnapshot,
  reroll: () => Promise<MinigameSnapshot>,
  isActive: () => boolean = () => true,
) {
  let round = snapshot;
  while (
    round.result?.dice &&
    round.result.dice.radiant === round.result.dice.dire
  ) {
    if (!isActive()) return undefined;
    round = await reroll();
  }
  return isActive() ? round : undefined;
}
