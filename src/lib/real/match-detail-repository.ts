import "server-only";
import { prisma } from "../prisma";
import { listRealMatches } from "./match-repository";
import { AccountError } from "./http";

export async function readRealMatch(actorId: string, id: string, db = prisma) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new AccountError("Partida no disponible.", 404);
  // Same visibility policy as public player history; all roster details still pass through its projection.
  const own = await db.matchPlayer.findFirst({
    where: { matchId: id, userId: actorId },
    select: { userId: true },
  });
  const visible =
    own ??
    (await db.matchPlayer.findFirst({
      where: { matchId: id, user: { profile: { visibility: "PUBLIC" } } },
      select: { userId: true },
    }));
  if (!visible) throw new AccountError("Partida no disponible.", 404);
  const data = await listRealMatches(visible.userId, db, actorId, id);
  if (!data.records[0]) throw new AccountError("Partida no disponible.", 404);
  return data.records[0];
}
