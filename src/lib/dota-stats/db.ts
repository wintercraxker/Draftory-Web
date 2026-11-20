import "server-only";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// adapter-pg 7.9.1 replaces timestamptz offsets with UTC instead of converting
// them. Keep only this provider/cache pool in UTC; do not alter auth/competition.
export function dotaPgConfig(
  connectionString: string | undefined,
  schema = "public",
) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error("INVALID_DATABASE_SCHEMA");
  return {
    connectionString,
    // Neon transaction pooling tracks TimeZone, but rejects search_path in
    // startup options. Public is the default and Prisma qualifies its models.
    // Non-public fixture schemas retain their explicit local search path.
    options:
      schema === "public"
        ? "-c timezone=UTC"
        : `-c timezone=UTC -c search_path=${schema}`,
    max: 3,
  };
}
const shared = globalThis as typeof globalThis & {
  dotaStatsPrisma?: PrismaClient;
};
const schema = process.env.DATABASE_SCHEMA ?? "public";
export const prisma =
  shared.dotaStatsPrisma ??
  new PrismaClient({
    adapter: new PrismaPg(dotaPgConfig(process.env.DATABASE_URL, schema), {
      schema,
    }),
  });
if (process.env.NODE_ENV !== "production") shared.dotaStatsPrisma = prisma;
