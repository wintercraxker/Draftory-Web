import "server-only";
import { clansInstalled } from "./clan-repository";
import { prisma } from "../prisma";
import { AccountError } from "./http";
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
  image?: string | null;
  state?: string | null;
  endsAt?: string | null;
};
export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
  serverNow: string;
  clanRevision?: string;
};
export async function readNotifications(
  userId: string,
  db = prisma,
): Promise<NotificationFeed> {
  return db.$transaction(
    async (tx) => {
      // Durable catch-up: no scheduler or worker dependency. Expiry remains derived
      // from endsAt; historical sanction records are never rewritten here.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const observedAt = new Date();
      await tx.$executeRaw`INSERT INTO "Notification" (id,"userId",type,payload,"createdAt")
        SELECT 'sanction-expired:' || s.id,s."userId",'SANCTION_EXPIRED',
          jsonb_build_object('description','Finalizó tu sanción temporal.','href','/reglas','sanctionId',s.id,'kind',s.kind,'endsAt',s."endsAt"),s."endsAt"
        FROM "PlayerSanction" s WHERE s."userId"=${userId} AND s.state='ACTIVE'
          AND s.kind IN ('MUTE','SUSPENSION') AND s."endsAt"<=${observedAt}
        ON CONFLICT (id) DO NOTHING`;
      const [rows, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where: { userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
        }),
        tx.notification.count({ where: { userId, readAt: null } }),
      ]);
      const [clanRevision] = (await clansInstalled(tx))
        ? await tx.$queryRaw<
            { revision: string }[]
          >`SELECT COALESCE(max("updatedAt")::text,'') revision FROM "Clan"`
        : [{ revision: "" }];
      const titles: Record<string, string> = {
        SUSPENSION: "Cuenta suspendida",
        MODERATION_WARNING: "Advertencia del staff",
        MODERATION_MUTE: "Silencio temporal",
        SUSPENSION_REVOKED: "Sanción revocada",
        SANCTION_EXPIRED: "Sanción temporal finalizada",
        ACHIEVEMENT: "Logro desbloqueado",
        MVP: "MVP obtenido",
        COMMEND: "Reconocimiento recibido",
        MATCH_RESULT: "Resultado de partida",
        ELO: "ELO actualizado",
        ROOM: "Novedad de sala",
        CLAN: "Novedad de tu clan",
        MMR_REVIEW: "Revisión de MMR",
        ACCOUNT_DELETION_PENDING: "Solicitud de eliminación pendiente",
      };
      const sanctionIds = rows.flatMap((r) => {
        const p = r.payload as Record<string, unknown>;
        return typeof p?.sanctionId === "string"
          ? [p.sanctionId]
          : r.id.startsWith("sanction:")
            ? [r.id.slice(9)]
            : [];
      });
      const sanctions = await tx.playerSanction.findMany({
        where: { userId, id: { in: sanctionIds } },
        select: { id: true, state: true, endsAt: true, kind: true },
      });
      return {
        clanRevision: clanRevision.revision,
        unreadCount,
        serverNow: new Date().toISOString(),
        items: rows.map((r) => {
          const p = r.payload as Record<string, unknown>;
          const sanction = sanctions.find(
            (s) =>
              s.id ===
              (p?.sanctionId ??
                (r.id.startsWith("sanction:") ? r.id.slice(9) : null)),
          );
          const href =
            typeof p?.href === "string" &&
            /^\/(perfil|configuracion|partidas|salas|reglas|clan(?:\/[^/?#]+)?|profile\/[^/?#]+)(\?[^#]*)?$/.test(
              p.href,
            )
              ? p.href
              : null;
          return {
            id: r.id,
            type: r.type,
            title:
              r.type === "ACHIEVEMENT" && typeof p?.achievementName === "string"
                ? p.achievementName.slice(0, 100)
                : sanction?.kind === "PERMANENT" && r.type === "SUSPENSION"
                  ? "Suspensión permanente"
                  : (titles[r.type] ?? "Novedad de Draftory"),
            image:
              sanction && ["SUSPENSION", "PERMANENT"].includes(sanction.kind)
                ? "/sancionado.png"
                : null,
            state: sanction
              ? sanction.state === "ACTIVE" &&
                sanction.endsAt &&
                sanction.endsAt <= new Date()
                ? "EXPIRED"
                : sanction.state
              : null,
            endsAt: sanction?.endsAt?.toISOString() ?? null,
            description:
              typeof p?.description === "string"
                ? p.description.slice(0, 180)
                : "",
            href,
            createdAt: r.createdAt.toISOString(),
            readAt: r.readAt?.toISOString() ?? null,
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function markNotifications(
  userId: string,
  id: string | null,
  db = prisma,
) {
  if (id !== null && (typeof id !== "string" || id.length > 200))
    throw new AccountError("Notificación inválida.");
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(id !== null ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return readNotifications(userId, db);
}
