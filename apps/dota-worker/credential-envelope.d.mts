export type LobbyCredentialBinding = {
  id: string;
  correlationId: string;
  lobbyId: string;
  publicName: string | null;
  secretRef?: string;
};
export function decryptLobbyCredentials(
  binding: LobbyCredentialBinding,
  envelope: unknown,
  env?: NodeJS.ProcessEnv,
): { name: string; password: string; lobbyId: string };
export function encryptLobbyCredentials(
  binding: LobbyCredentialBinding,
  credentials: { name: string; password: string; lobbyId: string },
  env?: NodeJS.ProcessEnv,
): unknown;
export function lobbyKeyring(env?: NodeJS.ProcessEnv): unknown;
