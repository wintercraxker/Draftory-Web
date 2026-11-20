import "server-only";
import {
  prepareEvidenceImages,
  evidenceFingerprint,
  isStoredImage,
} from "./private-report-images";
import { privateEvidenceStore } from "./r2-evidence-store";
import type { PrivateEvidenceStore } from "./report-evidence";
import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { AccountError, objectInput, plainText } from "./http";
import { reportCategories, moderationLimits } from "../moderation-config";
import { notifyStaff } from "./discord-staff";
import { normalizeRank } from "../dota-stats/normalize";
import { readProfileBundle } from "../dota-stats/sync";
import type { Prisma } from "../../generated/prisma/client";
import { resolvePublicIdentity } from "./identity-repository";
import { requirePermission } from "./staff-access";

export async function requireStaff(
  userId: string,
  db: Pick<
    Prisma.TransactionClient,
    "staffAuthorization" | "staffRolePermission"
  > = prisma,
) {
  return requirePermission(userId, undefined, db);
}
export async function readModeration(userId: string, db = prisma) {
  const now = new Date();
  const [user, suspension] = await Promise.all([
    db.staffAuthorization.findUnique({ where: { userId } }),
    db.playerSanction.findFirst({
      where: {
        userId,
        state: "ACTIVE",
        kind: { in: ["SUSPENSION", "PERMANENT"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { endsAt: "desc" },
      select: {
        id: true,
        publicReason: true,
        startsAt: true,
        endsAt: true,
        state: true,
      },
    }),
  ]);
  const communication = await db.playerSanction.findMany({
    where: {
      userId,
      state: "ACTIVE",
      kind: { in: ["MUTE", "WARNING"] },
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { id: true, kind: true, publicReason: true, endsAt: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  return {
    staff: Boolean(
      user &&
      ["OWNER", "ADMIN", "MODERATOR", "HELPER"].includes(user.role) &&
      !user.revokedAt,
    ),
    suspension,
    communication,
  };
}
export async function createReport(
  userId: string,
  input: unknown,
  db = prisma,
  delivery = notifyStaff,
  images: { bytes: Uint8Array; type: string }[] = [],
  imageStore?: PrivateEvidenceStore,
) {
  const value = objectInput(input, [
    "draftoryId",
    "roomId",
    "matchId",
    "category",
    "subject",
    "description",
    "evidence",
    "requestId",
  ]);
  if (
    value.requestId !== undefined &&
    (typeof value.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.requestId,
      ))
  )
    throw new AccountError("Identificador de solicitud inválido.");
  const stableId = value.requestId
    ? "report_" +
      createHash("sha256")
        .update(userId + ":" + value.requestId)
        .digest("hex")
    : undefined;
  const links =
    value.evidence === undefined || value.evidence === ""
      ? []
      : Array.isArray(value.evidence)
        ? value.evidence
        : [value.evidence];
  if (links.length > 3)
    throw new AccountError("Puedes adjuntar hasta 3 enlaces.");
  const linkEvidence = [...new Set(links.map(validateEvidence))].map((url) => ({
    url,
  }));
  const subject = plainText(value.subject, "Asunto", moderationLimits.subject);
  if (/[\r\n\t]/.test(subject))
    throw new AccountError("Asunto: escribe un título en una sola línea.");
  const description = plainText(
    value.description,
    "Descripción",
    moderationLimits.description,
  );
  if (
    !reportCategories.includes(
      value.category as (typeof reportCategories)[number],
    )
  )
    throw new AccountError("Categoría inválida.");
  const roomId = value.roomId ? plainText(value.roomId, "Sala", 128) : null,
    matchId = value.matchId ? plainText(value.matchId, "Partida", 128) : null;
  if (images.length && !stableId)
    throw new AccountError("Las capturas requieren una solicitud idempotente.");
  const store = images.length
    ? (imageStore ?? privateEvidenceStore())
    : undefined;
  const staged = store ? await prepareEvidenceImages(images, store) : [];
  const evidence = [...linkEvidence, ...staged];
  let report;
  try {
    report = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const target = await resolvePublicIdentity(value.draftoryId, tx);
      if (target === userId)
        throw new AccountError("No puedes reportarte a ti mismo.");
      const reported = await tx.user.findUnique({
        where: { id: target },
        select: { id: true, displayName: true },
      });
      if (!reported) throw new AccountError("Jugador no disponible.", 404);
      if (stableId) {
        const previous = await tx.playerReport.findUnique({
          where: { id: stableId },
          include: {
            reporter: { select: { displayName: true } },
            reportedUser: { select: { displayName: true } },
          },
        });
        if (previous) {
          if (
            previous.reporterId !== userId ||
            previous.reportedUserId !== target ||
            previous.category !== value.category ||
            previous.subject !== subject ||
            previous.description !== description ||
            previous.roomId !== roomId ||
            previous.matchId !== matchId ||
            evidenceFingerprint(previous.evidence) !==
              evidenceFingerprint(evidence)
          )
            throw new AccountError(
              "La solicitud ya se utilizó con otros datos.",
              409,
            );
          return previous;
        }
      }
      if (matchId) {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: {
            roomId: true,
            startedAt: true,
            players: {
              where: { userId: { in: [userId, target] } },
              select: { userId: true },
            },
          },
        });
        if (
          !match ||
          match.players.length !== 2 ||
          (roomId && match.roomId !== roomId) ||
          (value.category === "abandono" && !match.startedAt)
        )
          throw new AccountError("La partida no permite este reporte.", 403);
      }
      if (
        roomId &&
        (await tx.roomMember.count({
          where: { roomId, userId: { in: [userId, target] } },
        })) !== 2
      )
        throw new AccountError(
          "Debes haber compartido esa sala con el jugador.",
          403,
        );
      const now = new Date(),
        recent = await tx.playerReport.findMany({
          where: {
            reporterId: userId,
            createdAt: { gt: new Date(now.getTime() - 3600000) },
          },
          select: {
            reportedUserId: true,
            category: true,
            matchId: true,
            roomId: true,
            createdAt: true,
          },
        });
      if (
        recent.length >= moderationLimits.reportsPerHour ||
        recent.some(
          (r) =>
            r.reportedUserId === target &&
            r.category === value.category &&
            r.roomId === roomId &&
            r.matchId === matchId &&
            r.createdAt.getTime() >
              now.getTime() - moderationLimits.duplicateMinutes * 60000,
        )
      )
        throw new AccountError(
          "Ya enviaste este reporte o alcanzaste el límite. Espera antes de enviar otro.",
          429,
        );
      return tx.playerReport.create({
        data: {
          ...(stableId ? { id: stableId } : {}),
          reporterId: userId,
          reportedUserId: target,
          roomId,
          matchId,
          category: value.category as string,
          subject,
          description,
          evidence,
        },
        include: {
          reporter: { select: { displayName: true } },
          reportedUser: { select: { displayName: true } },
        },
      });
    });
  } catch (error) {
    if (store)
      try {
        const committed = stableId
          ? await db.playerReport.findUnique({
              where: { id: stableId },
              select: { evidence: true },
            })
          : null;
        const retained = new Set(
          Array.isArray(committed?.evidence)
            ? committed.evidence.filter(isStoredImage).map((i) => i.key)
            : [],
        );
        await store.remove(
          staged.filter((i) => !retained.has(i.key)).map((i) => i.key),
        );
      } catch {
        /* Keep ambiguous objects private for reference-aware cleanup; never delete possibly committed evidence. */
      }
    throw error;
  }
  if (store) {
    const retained = new Set(
      Array.isArray(report.evidence)
        ? report.evidence.filter(isStoredImage).map((i) => i.key)
        : [],
    );
    await store
      .remove(staged.filter((i) => !retained.has(i.key)).map((i) => i.key))
      .catch(() => {});
  }
  // Delivery/storage failure after commit must never turn a saved report into a failed submission.
  try {
    await dispatchReport(report.id, db, delivery);
    return await db.playerReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { id: true, status: true, discordDelivery: true },
    });
  } catch {
    return { id: report.id, status: report.status, discordDelivery: "UNKNOWN" };
  }
}
/** Durable PENDING queue, using the canonical report. Claim before any network I/O.
 * FAILED deliberately includes an ambiguous submission and is never retried blindly. */
export async function dispatchReport(
  id: string,
  db = prisma,
  delivery = notifyStaff,
) {
  const claimed = await db.playerReport.updateMany({
    where: { id, discordDelivery: { in: ["PENDING", "NOT_CONFIGURED"] } },
    data: { discordDelivery: "FAILED" },
  });
  if (claimed.count !== 1) return;
  const report = await db.playerReport.findUniqueOrThrow({
    where: { id },
    include: {
      reporter: { select: { displayName: true } },
      reportedUser: {
        select: {
          displayName: true,
          draftoryIdentity: { select: { publicId: true } },
        },
      },
    },
  });
  let state: "SENT" | "FAILED" | "NOT_CONFIGURED" | "RETRY" = "FAILED";
  try {
    state = await delivery({
      id: report.id,
      status: report.status,
      subject: report.subject,
      category: report.category,
      reporterName: report.reporter.displayName ?? "Jugador",
      reportedName: report.reportedUser.displayName ?? "Jugador",
      draftoryId:
        report.reportedUser.draftoryIdentity?.publicId ?? "No disponible",
      description: report.description,
      createdAt: report.createdAt.toISOString(),
      imageCount: Array.isArray(report.evidence)
        ? report.evidence.filter(isStoredImage).length
        : 0,
    });
  } catch {
    /* Ambiguous: preserve FAILED, not a retryable claim. */
  }
  await db.playerReport.update({
    where: { id },
    data: { discordDelivery: state === "RETRY" ? "PENDING" : state },
  });
}

function validateEvidence(value: unknown) {
  try {
    const url = new URL(plainText(value, "Enlace de evidencia", 1000));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(
        url.hostname,
      )
    )
      throw Error();
    return url.href;
  } catch {
    throw new AccountError(
      "La evidencia debe ser un enlace HTTPS público sin credenciales.",
    );
  }
}
export {
  staffDashboard as readStaff,
  moderateAction as staffAction,
} from "./staff-repository";
export async function readManualMedal(
  actorId: string,
  handle?: string,
  db = prisma,
) {
  const target = await db.user.findFirst({
    where: handle
      ? { OR: [{ id: handle }, { profile: { publicHandle: handle } }] }
      : { id: actorId },
    select: { id: true, profile: { select: { visibility: true } } },
  });
  if (
    !target?.profile ||
    (target.id !== actorId && target.profile.visibility !== "PUBLIC")
  )
    throw new AccountError("Perfil no disponible.", 404);
  const row = await db.manualDotaMedal.findUnique({
    where: { userId: target.id },
    select: { rankTier: true, state: true, declaredAt: true, verifiedAt: true },
  });
  return row ? { ...row, rank: normalizeRank(row.rankTier) } : null;
}
export async function declareMedal(
  userId: string,
  input: unknown,
  db = prisma,
) {
  const value = objectInput(input, ["rankTier"]);
  if (!normalizeRank(value.rankTier))
    throw new AccountError("Medalla inválida.");
  const bundle = await readProfileBundle(db, userId);
  if (bundle.availability !== "PUBLIC_DATA_NOT_SHARED")
    throw new AccountError(
      "La declaración manual requiere evidencia de datos no compartidos.",
      409,
    );
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const old = await tx.manualDotaMedal.findUnique({ where: { userId } });
    if (old?.rankTier === value.rankTier) return;
    await tx.manualDotaMedal.upsert({
      where: { userId },
      create: { userId, rankTier: value.rankTier as number },
      update: {
        rankTier: value.rankTier as number,
        state: "MANUAL_PENDING",
        declaredAt: new Date(),
        verifiedAt: null,
        verifiedById: null,
      },
    });
  });
  return readManualMedal(userId, undefined, db);
}
