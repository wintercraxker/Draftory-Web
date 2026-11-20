export function fixturePreview(env?: NodeJS.ProcessEnv): boolean;
export function previewOrigin(env?: NodeJS.ProcessEnv): string | null;
export function previewSteamEnabled(env?: NodeJS.ProcessEnv): boolean;
export function permittedSteamIdentity(
  steamId: string,
  env?: NodeJS.ProcessEnv,
): boolean;
export function permittedPreviewUser(
  id: string,
  env?: NodeJS.ProcessEnv,
  steamId?: string | null,
): boolean;
export function blockedPreviewPath(
  path: string,
  method: string,
  env?: NodeJS.ProcessEnv,
): boolean;
export function blockedPreviewAction(
  action: string,
  env?: NodeJS.ProcessEnv,
): boolean;
