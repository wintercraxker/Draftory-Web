import pg from "pg";
import { assertDatabaseIdentity } from "./database-policy.mjs";
// Separate bounded pool avoids deadlocking a transaction pool with a guard query.
let pool;
export async function guardWebDatabase(write) {
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
    options:
      process.env.DATABASE_SCHEMA &&
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(process.env.DATABASE_SCHEMA)
        ? "-c search_path=" + process.env.DATABASE_SCHEMA
        : undefined,
  });
  await assertDatabaseIdentity((sql) => pool.query(sql), process.env, {
    write,
  });
}
