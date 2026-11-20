import type { PrismaClient } from "../../generated/prisma/client";
import { erasedAccount } from "../real/account-lifecycle";
import { authConfig } from "./config";
import { hashToken, newToken, steamAccountId, validToken } from "./openid";
import { ensurePublicIdentity } from "../real/identity-allocator";
import {
  permittedPreviewUser,
  permittedSteamIdentity,
} from "../deployment/preview-policy.mjs";

export async function recoverSteamUser(db: PrismaClient, steamId: string) {
  if (!permittedSteamIdentity(steamId))
    throw new Error("PREVIEW_STEAM_IDENTITY_DENIED");
  const accountId = steamAccountId(steamId);
  return db.$transaction(async (tx) => {
    // Serialize only this Steam identity, across processes, including optional
    // linking of an already-known legacy DotaAccount. Never link by display name.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${steamId}, 0))::text`;
    const linked = await tx.dotaAccount.findUnique({ where: { steamId } });
    if (linked)
      await tx.user.update({ where: { id: linked.userId }, data: { steamId } });
    const user = await tx.user.upsert({
      where: { steamId },
      update: {},
      create: {
        steamId,
        username: `steam-${accountId}`,
        displayName: "Jugador de Steam",
        pointWallet: { create: {} },
        dotaAccount: { create: { steamId, dotaAccountId: accountId } },
      },
      include: { profile: true },
    });
    await tx.dotaAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, steamId, dotaAccountId: accountId },
      update: { steamId, dotaAccountId: accountId },
    });
    await tx.pointWallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    await ensurePublicIdentity(tx, user.id);
    return user;
  });
}

export async function createSession(
  db: PrismaClient,
  userId: string,
  now = new Date(),
) {
  const token = newToken();
  await db.authSession.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(now.getTime() + authConfig.sessionSeconds * 1000),
    },
  });
  return token;
}
export async function sessionUser(
  db: PrismaClient,
  token: string | null | undefined,
  now = new Date(),
) {
  if (!validToken(token)) return null;
  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true, pointWallet: true } } },
  });
  return session &&
    permittedPreviewUser(session.userId, process.env, session.user.steamId) &&
    session.expiresAt > now &&
    !(await erasedAccount(db, session.userId))
    ? session.user
    : null;
}
export async function revokeSession(
  db: PrismaClient,
  token: string | undefined,
) {
  if (validToken(token))
    await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
