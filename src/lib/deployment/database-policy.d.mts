export function databaseTarget(
  value: string,
  options?: { session?: boolean },
  env?: NodeJS.ProcessEnv,
): { neon: boolean; hostname: string; database: string };
export function assertDatabaseIdentity(
  query: (sql: string) => Promise<unknown>,
  env?: NodeJS.ProcessEnv,
  options?: { write?: boolean },
): Promise<void>;
