import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { AccountError, objectInput } from "../real/http";
import { hashToken, validToken } from "./openid";
const digest = (token: string, value: string) =>
  createHmac("sha256", token).update(value).digest("hex");
const same = (a: string, b: string) =>
  /^[a-f0-9]{64}$/.test(a) &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function accountSessions(
  userId: string,
  token: string | undefined,
  input?: unknown,
  db = prisma,
) {
  if (!validToken(token)) throw new AccountError("Sesión no válida.", 401);
  const currentHash = hashToken(token),
    now = new Date();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "tokenHash" FROM "AuthSession" WHERE "tokenHash"=${currentHash} AND "userId"=${userId} FOR UPDATE`;
    const current = await tx.authSession.findUnique({
      where: { tokenHash: currentHash },
    });
    if (!current || current.userId !== userId || current.expiresAt <= now)
      throw new AccountError("Tu sesión ha caducado.", 401);
    const handle = (hash: string) => digest(token, `session:${userId}:${hash}`);
    const snapshot = (cutoff: number, expires: number) =>
      `${cutoff}.${expires}.${digest(token, `others:${userId}:${cutoff}:${expires}`)}`;
    if (input !== undefined) {
      const value = objectInput(input, ["action", "id", "snapshot"]);
      if (value.action === "others") {
        if (typeof value.snapshot !== "string" || value.snapshot.length > 110)
          throw new AccountError("Confirma de nuevo las sesiones.");
        const [time, end, signature] = value.snapshot.split(".");
        const cutoff = Number(time),
          expires = Number(end);
        if (
          !Number.isSafeInteger(cutoff) ||
          !Number.isSafeInteger(expires) ||
          cutoff > now.getTime() ||
          expires < now.getTime() ||
          expires - cutoff !== 300000 ||
          !same(
            signature ?? "",
            digest(token, `others:${userId}:${cutoff}:${expires}`),
          )
        )
          throw new AccountError(
            "La confirmación caducó. Actualiza y revisa otra vez.",
            409,
          );
        const removed = await tx.authSession.deleteMany({
          where: {
            userId,
            tokenHash: { not: currentHash },
            createdAt: { lte: new Date(cutoff) },
          },
        });
        return { removed: removed.count, currentRevoked: false };
      }
      if (
        value.action !== "revoke" ||
        typeof value.id !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.id)
      )
        throw new AccountError("Sesión o acción no válida.");
      const rows = await tx.authSession.findMany({
        where: { userId, expiresAt: { gt: now } },
        take: 50,
        orderBy: [{ createdAt: "desc" }, { tokenHash: "desc" }],
      });
      const row = [current, ...rows].find((s) =>
        same(value.id as string, handle(s.tokenHash)),
      );
      if (!row) return { removed: 0, currentRevoked: false }; // Same response for unknown, foreign and already-revoked handles.
      const removed = await tx.authSession.deleteMany({
        where: { userId, tokenHash: row.tokenHash },
      });
      return {
        removed: removed.count,
        currentRevoked: row.tokenHash === currentHash,
      };
    }
    const where = { userId, expiresAt: { gt: now } };
    const [rows, total] = await Promise.all([
      tx.authSession.findMany({
        where,
        take: 50,
        orderBy: [{ createdAt: "desc" }, { tokenHash: "desc" }],
      }),
      tx.authSession.count({ where }),
    ]);
    const sessions = rows.some((s) => s.tokenHash === currentHash)
      ? rows
      : [current, ...rows];
    return {
      sessions: sessions.map((row) => ({
        id: handle(row.tokenHash),
        current: row.tokenHash === currentHash,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        device:
          row.tokenHash === currentHash
            ? "Este navegador"
            : "Dispositivo no registrado",
        lastActiveAt: null,
      })),
      total,
      limit: 50,
      snapshot: snapshot(now.getTime(), now.getTime() + 300000),
    };
  });
}
