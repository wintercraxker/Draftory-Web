import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { randomUUID } from "node:crypto";
import { AccountError } from "./errors";
import { tourVersion, validTourStep } from "../tour/steps";
import { mmrInstalled } from "./mmr-repository";
import {
  AccountDeletionBlocked,
  classifyErasureLobbies,
} from "./account-erasure-links";
type Db = PrismaClient | Prisma.TransactionClient;
function redactPersonalEvent(
  value: Prisma.JsonValue,
  identifiers: Set<string>,
): Prisma.InputJsonValue | null {
  if (typeof value === "string")
    return identifiers.has(value) ? "[Cuenta eliminada]" : value;
  if (Array.isArray(value))
    return value.map((item) => redactPersonalEvent(item, identifiers));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactPersonalEvent(item ?? null, identifiers),
      ]),
    );
  return value;
}
export async function lifecycleInstalled(db: Db) {
  const rows = await db.$queryRaw<
    { installed: boolean }[]
  >`SELECT to_regclass('"AccountLifecycle"') IS NOT NULL AS installed`;
  return rows[0].installed;
}
export async function erasedAccount(db: Db, userId: string) {
  return (
    (await lifecycleInstalled(db)) &&
    !!(
      await db.accountLifecycle.findUnique({
        where: { userId },
        select: { deletedAt: true },
      })
    )?.deletedAt
  );
}
export async function readTour(db: PrismaClient, userId: string) {
  if (!(await lifecycleInstalled(db)))
    return {
      installed: false,
      eligible: false,
      status: "NOT_STARTED",
      step: 0,
      version: 1,
    };
  const row = await db.accountLifecycle.findUnique({ where: { userId } });
  const effectiveVersion = (await mmrInstalled(db)) ? tourVersion : 1;
  return {
    installed: true,
    eligible: !!row?.tourEligible && !row.deletedAt,
    status: row?.tourStatus ?? "NOT_STARTED",
    step: row && validTourStep(row.tourStep) ? row.tourStep : 0,
    version: row?.tourVersion ?? effectiveVersion,
  };
}
export async function writeTour(
  db: PrismaClient,
  userId: string,
  input: unknown,
) {
  if (!(await lifecycleInstalled(db)))
    throw new AccountError(
      "La guía requiere activar la migración de cuenta.",
      503,
    );
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AccountError("Estado inválido.");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((k) => !["status", "step", "replay"].includes(k)) ||
    !["IN_PROGRESS", "COMPLETED", "SKIPPED"].includes(String(value.status)) ||
    !validTourStep(Number(value.step)) ||
    typeof value.step !== "number" ||
    (value.replay !== undefined && value.replay !== true)
  )
    throw new AccountError("Estado inválido.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    if (await erasedAccount(tx, userId))
      throw new AccountError("Cuenta no disponible.", 401);
    const row = await tx.accountLifecycle.findUnique({ where: { userId } });
    if (!row?.tourEligible && !value.replay)
      throw new AccountError("Activa el recorrido desde Configuración.");
    if (
      row &&
      ["COMPLETED", "SKIPPED"].includes(row.tourStatus) &&
      !value.replay
    )
      throw new AccountError("El recorrido ya terminó.", 409);
    const data = {
      tourEligible: true,
      tourVersion:
        (value.replay || !row) && (await mmrInstalled(tx))
          ? tourVersion
          : (row?.tourVersion ?? 1),
      tourStatus: String(value.status),
      tourStep: Number(value.step),
    };
    await tx.accountLifecycle.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  });
  return readTour(db, userId);
}
async function eraseAccountAttempt(
  db: PrismaClient,
  userId: string,
  confirmation: unknown,
) {
  if (confirmation !== "ELIMINAR")
    throw new AccountError("Escribe ELIMINAR para confirmar.");
  if (!(await lifecycleInstalled(db)))
    throw new AccountError(
      "La eliminación segura requiere activar la migración de cuenta.",
      503,
    );
  return db.$transaction(
    async (tx) => {
      const { clansInstalled } = await import("./clan-repository");
      if (await clansInstalled(tx)) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(726198,119)::text`;
        const [membership] = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "ClanMembership" WHERE "userId"=${userId} AND "leftAt" IS NULL`;
        if (membership)
          throw new AccountDeletionBlocked(
            "CLAN_ACTIVE",
            "Abandona tu clan antes de eliminar la cuenta. Si eres líder, transfiere el liderazgo o disuelve el clan.",
            "/clan",
          );
        await tx.$executeRaw`UPDATE "ClanRequest" SET state='INVALIDATED',"resolvedAt"=clock_timestamp() WHERE "userId"=${userId} AND state='PENDING'`;
      }
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AccountError("Cuenta no disponible.", 404);
      if (await erasedAccount(tx, userId)) return { erased: true };
      const active = ["FINISHED", "CANCELLED"] as const;
      if (
        await tx.room.count({
          where: { creatorId: userId, phase: { notIn: [...active] } },
        })
      )
        throw new AccountDeletionBlocked(
          "ROOM_ACTIVE",
          "Cierra primero tu sala activa antes de eliminar la cuenta.",
          "/salas",
        );
      if (
        await tx.roomMember.count({
          where: {
            userId,
            leftAt: null,
            room: { phase: { notIn: [...active] } },
          },
        })
      )
        throw new AccountDeletionBlocked(
          "ROOM_MEMBERSHIP",
          "Sal de tu sala o finaliza el intento activo antes de eliminar la cuenta.",
          "/salas",
        );
      if (
        await tx.matchPlayer.count({
          where: {
            userId,
            match: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
          },
        })
      )
        throw new AccountDeletionBlocked(
          "MATCH_ACTIVE",
          "Tu cuenta está vinculada a un intento o partida en curso. Podrás completar la eliminación cuando termine.",
          "/partidas",
        );
      if (await tx.prediction.count({ where: { userId, status: "PENDING" } }))
        throw new AccountDeletionBlocked(
          "PREDICTION_PENDING",
          "Espera a que se resuelvan tus predicciones pendientes.",
          "/predicciones",
        );
      if (
        (await tx.playerSanction.count({
          where: {
            userId,
            state: "ACTIVE",
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
        })) ||
        (await tx.playerReport.count({
          where: { reportedUserId: userId, status: "OPEN" },
        }))
      )
        throw new AccountDeletionBlocked(
          "MODERATION_PENDING",
          "Hay una revisión de moderación pendiente. Contacta al staff antes de eliminar la cuenta.",
          "/reglas",
        );
      const links = await classifyErasureLobbies(tx, userId);
      if (links.uncertain)
        throw new AccountDeletionBlocked(
          "LOBBY_UNCERTAIN",
          "Estamos comprobando el estado de una partida anterior. La eliminación requiere que termine su revisión.",
          "/reglas",
        );
      const sync = await tx.dotaManualSync.findUnique({ where: { userId } });
      if (sync?.leaseUntil && sync.leaseUntil > new Date())
        throw new AccountDeletionBlocked(
          "PROFILE_SYNC",
          "Espera a que termine la sincronización en curso.",
          "/configuracion?tab=dota",
        );
      await tx.authSession.deleteMany({ where: { userId } });
      await tx.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followingId: userId }] },
      });
      await tx.profileAvatar.deleteMany({ where: { userId } });
      await tx.dotaExternalCache.deleteMany({ where: { userId } });
      await tx.dotaManualSync.deleteMany({ where: { userId } });
      await tx.manualDotaMedal.deleteMany({ where: { userId } });
      await tx.dotaAccount.deleteMany({ where: { userId } });
      if (await mmrInstalled(tx)) {
        await tx.$executeRaw`UPDATE "MmrReviewEvent" SET reason='Cuenta eliminada: texto retirado',evidence='' WHERE "userId"=${userId} OR "actorId"=${userId}`;
        await tx.$executeRaw`DELETE FROM "CompetitiveMmr" WHERE "userId"=${userId}`;
      }
      await tx.notification.deleteMany({ where: { userId } });
      await tx.staffAuthorization.deleteMany({ where: { userId } });
      await tx.roomAccessBudget.deleteMany({ where: { userId } });
      await tx.profile.deleteMany({ where: { userId } });
      // Reserve the public identifier permanently; never reassign historical DF-IDs.
      await tx.roomMessage.updateMany({
        where: { authorId: userId },
        data: { body: "[Contenido retirado por eliminación de cuenta]" },
      });
      const identifiers = new Set(
        [
          user.steamId,
          user.discordId,
          user.username,
          user.displayName,
          user.avatar,
          user.customAvatarUrl,
          user.bio,
        ].filter((v): v is string => !!v),
      );
      const personalEvents = await tx.roomEvent.findMany({
        where: { actorId: userId },
        select: { id: true, payload: true },
      });
      for (const event of personalEvents)
        await tx.roomEvent.update({
          where: { id: event.id },
          data: {
            payload: redactPersonalEvent(
              event.payload,
              identifiers,
            ) as Prisma.InputJsonValue,
          },
        });
      await tx.user.update({
        where: { id: userId },
        data: {
          steamId: null,
          discordId: null,
          username: "deleted-" + randomUUID(),
          displayName: "Cuenta eliminada",
          avatar: null,
          customAvatarUrl: null,
          bio: null,
        },
      });
      await tx.accountLifecycle.upsert({
        where: { userId },
        create: { userId, deletedAt: new Date(), tourStatus: "SKIPPED" },
        update: {
          deletedAt: new Date(),
          tourEligible: false,
          tourStatus: "SKIPPED",
          tourStep: 0,
        },
      });
      await tx.staffAuditLog.create({
        data: {
          actorId: userId,
          targetId: userId,
          permission: "privacy.request",
          action: "ACCOUNT_ERASED",
          reason: "Solicitud confirmada del titular",
          result: "SUCCESS",
          changes: {
            anonymized: true,
            retainedTechnicalRecords: links.terminal + links.historical,
          },
        },
      });
      return { erased: true };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

export async function eraseAccount(
  db: PrismaClient,
  userId: string,
  confirmation: unknown,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await eraseAccountAttempt(db, userId, confirmation);
    } catch (error) {
      const e = error as {
        code?: string;
        meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
      };
      const serialization =
        e?.code === "P2034" ||
        ["40001", "40P01"].includes(
          e?.meta?.driverAdapterError?.cause?.originalCode ?? "",
        );
      if (error instanceof AccountDeletionBlocked) {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
          if (await erasedAccount(tx, userId)) return;
          const id = "account-deletion-pending:" + userId,
            old = await tx.notification.findUnique({ where: { id } });
          const payload = {
            description:
              "Tu solicitud de eliminación está pendiente. Resuelve el vínculo indicado y vuelve a confirmar.",
            href: "/configuracion?tab=cuenta",
            block: error.block,
            resolution: error.resolution,
          };
          await tx.notification.upsert({
            where: { id },
            create: { id, userId, type: "ACCOUNT_DELETION_PENDING", payload },
            update: { payload },
          });
          if (!old)
            await tx.staffAuditLog.create({
              data: {
                actorId: userId,
                targetId: userId,
                permission: "privacy.request",
                action: "ACCOUNT_DELETION_REQUESTED",
                reason: "Solicitud del titular pendiente de resolución",
                result: "PENDING",
                changes: { block: error.block },
              },
            });
        });
        throw error;
      }
      if (attempt === 2 || !serialization) throw error;
    }
  }
  throw new AccountError("Inténtalo de nuevo.", 503);
}
