import type { PlayerProfileData } from "../player-profiles";
export type SessionIdentity = {
  id: string;
  name: string;
  avatar: string | null;
  handle: string;
  onboardingRequired: boolean;
  mmrRequired?: boolean;
  mmrVerified?: boolean;
  player: PlayerProfileData | null;
  points: number;
  staff?: { role: string; canAccessStaff: boolean };
};
