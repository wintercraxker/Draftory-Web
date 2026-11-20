import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { AccountError } from "./errors";
export class RequestLimitError extends AccountError {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Demasiados intentos. Espera un momento y vuelve a intentarlo.", 429);
    this.retryAfter = retryAfter;
  }
}
export async function reserveRequestBudget(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  db = prisma,
) {
  if (process.env.DRAFTORY_SHARED_RATE_LIMITS !== "true") return;
  if (
    !/^[a-z-]{1,40}$/.test(scope) ||
    !subject ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1000
  )
    throw new Error("INVALID_REQUEST_BUDGET");
  const key = createHash("sha256")
    .update(scope + ":" + subject)
    .digest("hex");
  // One committed statement, independent of the business transaction and instance.
  // Failed operations count too. Expiry uses the PostgreSQL clock.
  const [row] = await db.$queryRaw<{ attempts: number; retry: number }[]>`
  INSERT INTO "RequestBudget" (key,attempts,"expiresAt") VALUES (${key},1,clock_timestamp()+${windowMs}*interval '1 millisecond')
  ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN "RequestBudget"."expiresAt"<=clock_timestamp() THEN 1 ELSE LEAST("RequestBudget".attempts,2147483646)+1 END,
  "expiresAt"=CASE WHEN "RequestBudget"."expiresAt"<=clock_timestamp() THEN clock_timestamp()+${windowMs}*interval '1 millisecond' ELSE "RequestBudget"."expiresAt" END
  RETURNING attempts,GREATEST(1,ceil(extract(epoch FROM ("expiresAt"-clock_timestamp()))))::int retry`;
  if (row.attempts > limit) throw new RequestLimitError(row.retry);
}
export function loginBudgetSubject(request: Request) {
  // Trust only a single IP header overwritten by a configured reverse proxy.
  // Ignore user-provided forwarded headers by default. No raw IP is persisted.
  const ip =
    process.env.DRAFTORY_TRUST_PROXY_IP === "true"
      ? request.headers.get("x-real-ip")
      : null;
  const secret = process.env.DRAFTORY_RATE_LIMIT_KEY;
  if (ip && secret && secret.length >= 32 && /^[a-fA-F0-9:.]{3,64}$/.test(ip))
    return createHmac("sha256", secret).update(ip).digest("hex");
  return "deployment-global";
}
export async function accountBudget(
  request: Request,
  userId: string,
  db = prisma,
) {
  const path = new URL(request.url).pathname,
    write = !["GET", "HEAD"].includes(request.method);
  if (path === "/api/rooms/presence") return; // Heartbeats are not user actions.
  const [scope, limit, windowMs]: [string, number, number] =
    path === "/api/rooms" && write
      ? ["room-create", 12, 60000]
      : path === "/api/reports" && write
        ? ["report-create", 12, 600000]
        : path.startsWith("/api/staff")
          ? ["staff", write ? 60 : 180, 60000]
          : path.startsWith("/api/rooms")
            ? ["rooms", write ? 120 : 240, 60000]
            : path.startsWith("/api/dota-stats")
              ? ["statistics", write ? 12 : 120, 60000]
              : [
                  write ? "account-write" : "account-read",
                  write ? 90 : 300,
                  60000,
                ];
  await reserveRequestBudget(scope, userId, limit, windowMs, db);
}

export async function acquireStreamLease(userId: string, db = prisma) {
  if (process.env.DRAFTORY_SHARED_RATE_LIMITS !== "true")
    return { refresh: async () => true, release: async () => {} };
  const subject = createHash("sha256")
      .update("stream:" + userId)
      .digest("hex"),
    id = randomUUID();
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subject},712))::text`;
    const [row] = await tx.$queryRaw<
      { n: number }[]
    >`SELECT count(*)::int n FROM "RequestLease" WHERE subject=${subject} AND "expiresAt">clock_timestamp()`;
    if (row.n >= 5) throw new RequestLimitError(15);
    await tx.$executeRaw`INSERT INTO "RequestLease" (id,subject,"expiresAt") VALUES (${id},${subject},clock_timestamp()+interval '15 seconds')`;
  });
  return {
    async refresh() {
      return (
        (await db.$executeRaw`UPDATE "RequestLease" SET "expiresAt"=clock_timestamp()+interval '15 seconds' WHERE id=${id} AND subject=${subject} AND "expiresAt">clock_timestamp()`) >
        0
      );
    },
    async release() {
      await db.$executeRaw`DELETE FROM "RequestLease" WHERE id=${id} AND subject=${subject}`;
    },
  };
}
