import "server-only";
import { prisma } from "../prisma";
import { steamAccountId } from "../auth/openid";
import {
  validateSocialLinks,
  type ProfileSocials,
  type SocialLinks,
} from "../profile-socials";
import { AccountError } from "./errors";
import type { Prisma } from "../../generated/prisma/client";
type Database = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export function dotabuffUrl(
  steamId: string | null,
  accountId: string | null,
  dotaSteamId: string | null,
): string | null {
  if (
    typeof steamId !== "string" ||
    !steamId ||
    (dotaSteamId && dotaSteamId !== steamId)
  )
    return null;
  try {
    const id = steamAccountId(steamId);
    if (accountId && accountId !== id) return null;
    return `https://www.dotabuff.com/players/${id}`;
  } catch {
    return null;
  }
}
export async function readProfileSocials(
  actorId: string,
  targetId: string,
  db: Database = prisma,
): Promise<ProfileSocials> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetId))
    throw new AccountError("Perfil no disponible.", 404);
  // One fresh privacy-qualified query; no public response contains SteamID64 or stored internal IDs.
  const rows = await db.$queryRaw<
    {
      socialLinks: unknown;
      dotabuffEditable: boolean;
      steamId: string | null;
    }[]
  >`SELECT p."socialLinks",CASE WHEN u.id=${actorId} THEN u."steamId" ELSE NULL END AS "steamId",
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"Profile"'::regclass AND conname='Profile_socialLinks_object' AND position('''dotabuff''' in pg_get_constraintdef(oid))>0) AS "dotabuffEditable"
    FROM "Profile" p JOIN "User" u ON u.id=p."userId" LEFT JOIN "AccountLifecycle" a ON a."userId"=u.id WHERE u.id=${targetId} AND a."deletedAt" IS NULL AND (u.id=${actorId} OR p.visibility='PUBLIC')`;
  const row = rows[0];
  if (!row) throw new AccountError("Perfil no disponible.", 404);
  let links: SocialLinks = {};
  try {
    links = validateSocialLinks(row.socialLinks);
  } catch {
    /* Fail closed if legacy/imported metadata is invalid. */
  }
  return {
    links,
    dotabuffEditable: row.dotabuffEditable,
    // Retain the legacy response key, but never infer public consent from Steam login.
    dotabuff:
      links.dotabuff ??
      (actorId === targetId ? dotabuffUrl(row.steamId, null, null) : null),
    ...(actorId === targetId
      ? { dotabuffGenerated: dotabuffUrl(row.steamId, null, null) }
      : {}),
  };
}
const writes = new Map<string, { at: number; count: number }>();
export async function saveProfileSocials(
  actorId: string,
  input: unknown,
  db: Database = prisma,
) {
  let links;
  try {
    links = validateSocialLinks(input);
  } catch (e) {
    throw new AccountError(e instanceof Error ? e.message : "Redes inválidas.");
  }
  if (
    links.dotabuff &&
    !(await readProfileSocials(actorId, actorId, db)).dotabuffEditable
  )
    throw new AccountError(
      "El enlace de Dotabuff está pendiente de activación. Puedes guardar las demás redes.",
      503,
    );
  const now = Date.now(),
    previous = writes.get(actorId),
    entry =
      previous && now - previous.at < 60000 ? previous : { at: now, count: 0 };
  if (entry.count >= 15)
    throw new AccountError(
      "Espera un minuto antes de guardar más cambios.",
      429,
    );
  if (writes.size >= 2000)
    for (const [id, v] of writes) if (now - v.at >= 60000) writes.delete(id);
  if (writes.size >= 2000 && !writes.has(actorId))
    throw new AccountError("Inténtalo más tarde.", 429);
  entry.count++;
  writes.set(actorId, entry);
  // Full replacement is atomic; identity is exclusively the authenticated server actor.
  const affected =
    await db.$executeRaw`UPDATE "Profile" SET "socialLinks"=${JSON.stringify(links)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "userId"=${actorId} AND NOT EXISTS (SELECT 1 FROM "AccountLifecycle" WHERE "userId"=${actorId} AND "deletedAt" IS NOT NULL)`;
  if (affected !== 1) throw new AccountError("Perfil no disponible.", 404);
  return readProfileSocials(actorId, actorId, db);
}
