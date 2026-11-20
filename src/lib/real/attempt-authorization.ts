import "server-only";
import type { Prisma } from "../../generated/prisma/client";
export function authorizationExecutor(tx: Prisma.TransactionClient) {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        sql,
        ...params,
      );
      return { rows, rowCount: rows.length };
    },
  };
}
