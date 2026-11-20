import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseTarget } from "./deployment/database-policy.mjs";
import { guardWebDatabase } from "./deployment/database-guard.mjs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaForecastSchemaVersion?: number;
};

if (process.env.DATABASE_URL) databaseTarget(process.env.DATABASE_URL);
const adapter = new PrismaPg(
  {
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL === "1" ? 3 : 10,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    options:
      process.env.DATABASE_SCHEMA &&
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(process.env.DATABASE_SCHEMA)
        ? `-c search_path=${process.env.DATABASE_SCHEMA}`
        : undefined,
  },
  { schema: process.env.DATABASE_SCHEMA || "public" },
);

const previous = globalForPrisma.prisma;
// next dev preserves globals across regeneration. A client from the previous
// schema has no delegates for new staff models, even after the source reloads.
const stale =
  previous &&
  (!previous.staffRolePermission ||
    !previous.staffAuditLog ||
    globalForPrisma.prismaForecastSchemaVersion !== 3);
if (stale) {
  console.warn("PRISMA_SCHEMA_CLIENT_REFRESHED");
  void previous.$disconnect().catch(() => {});
}
const basePrisma =
  (stale ? undefined : previous) ??
  new PrismaClient({
    adapter,
  });

// Only enabled with an explicit deployment identity; old local runtime stays compatible.
// SQL maintenance triggers provide the atomic write fence inside transactions.
export const prisma =
  process.env.DRAFTORY_EXPECTED_DATABASE_ID || process.env.VERCEL === "1"
    ? (basePrisma.$extends({
        query: {
          $allOperations: async ({ args, operation, query }) => {
            await guardWebDatabase(
              ![
                "findUnique",
                "findUniqueOrThrow",
                "findFirst",
                "findFirstOrThrow",
                "findMany",
                "count",
                "aggregate",
                "groupBy",
              ].includes(operation),
            );
            return query(args);
          },
        },
      }) as unknown as PrismaClient)
    : basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.prismaForecastSchemaVersion = 3;
}
