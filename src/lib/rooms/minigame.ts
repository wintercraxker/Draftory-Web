export type CaptainSide = "radiant" | "dire";
export type RpsMove = "rock" | "paper" | "scissors";
export type FirstPickResult = {
  dice?: { radiant: number; dire: number };
  choices?: { radiant: RpsMove; dire: RpsMove };
};
export type MinigameSnapshot = {
  ready: Record<CaptainSide, boolean>;
  dice: Partial<Record<CaptainSide, number>>;
  revealing: boolean;
  result: FirstPickResult | null;
};
export type MinigameSession = {
  id: string;
  tokens: Record<CaptainSide, string>;
};
