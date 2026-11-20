import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import {
  validateMmr,
  mmrMaximum,
  mmrStates,
  type MmrState,
  type OperationalMmr,
} from "../mmr-policy";
import { AccountError } from "./errors";
import { objectInput, plainText } from "./http";
import { requirePermission } from "./staff-access";
import { verifiedDraftorySql } from "./verified-match";

type Tx = Prisma.TransactionClient;
export type MmrRow = {
  userId: string;
  declared: number;
  approved: number | null;
  status: MmrState;
  revision: number;
  declaredAt: Date;
  updatedAt: Date;
  verifiedAt: Date | null;
  reviewerId: string | null;
};
export async function mmrInstalled(db: Pick<Tx, "$queryRaw"> = prisma) {
  const [r] = await db.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(current_schema() || '."CompetitiveMmr"') IS NOT NULL AND to_regclass(current_schema() || '."MmrReviewEvent"') IS NOT NULL ready`;
  return r.ready;
}
export function operationalMmr(row: MmrRow): OperationalMmr {
  // A pending request never replaces a still-approved value.
  return {
    value: row.approved ?? row.declared,
    verified: row.approved !== null,
    status: row.status,
    revision: row.revision,
  };
}
export async function readOperationalMmrs(
  ids: string[],
  db: Pick<Tx, "$queryRaw"> = prisma,
) {
  const result = new Map<string, OperationalMmr>();
  if (!ids.length || !(await mmrInstalled(db))) return result;
  for (const id of ids)
    result.set(id, {
      value: null,
      verified: false,
      status: "UNVERIFIED",
      revision: 0,
    });
  const rows = await db.$queryRaw<
    MmrRow[]
  >`SELECT * FROM "CompetitiveMmr" WHERE "userId" IN (${Prisma.join([...new Set(ids)])})`;
  for (const row of rows) result.set(row.userId, operationalMmr(row));
  return result;
}
export async function assertCompetitiveMmr(db: Tx, ids: string[]) {
  if (!(await mmrInstalled(db))) return; // Existing release stays usable until approved migration.
  const rows = await readOperationalMmrs(ids, db);
  if (ids.some((id) => (rows.get(id)?.value ?? 0) <= 0))
    throw new AccountError(
      "Completa tu MMR en Configuración antes de participar en una nueva sala competitiva.",
      403,
    );
}
export async function readOwnMmr(userId: string, db = prisma) {
  if (!(await mmrInstalled(db)))
    return { installed: false, maximum: mmrMaximum(), row: null };
  const [row] = await db.$queryRaw<
    MmrRow[]
  >`SELECT * FROM "CompetitiveMmr" WHERE "userId"=${userId}`;
  return {
    installed: true,
    maximum: mmrMaximum(),
    row: row
      ? {
          value: operationalMmr(row).value,
          verified: operationalMmr(row).verified,
          status: row.status,
          revision: row.revision,
          declaredAt: row.declaredAt,
          verifiedAt: row.verifiedAt,
        }
      : null,
  };
}
export async function declareInitialMmr(tx: Tx, userId: string, value: number) {
  validateMmr(value);
  const [existing] = await tx.$queryRaw<
    { userId: string }[]
  >`SELECT "userId" FROM "CompetitiveMmr" WHERE "userId"=${userId}`;
  if (existing) return;
  await tx.$executeRaw`INSERT INTO "CompetitiveMmr" ("userId",declared) VALUES (${userId},${value})`;
  const [row] = await tx.$queryRaw<
    MmrRow[]
  >`SELECT * FROM "CompetitiveMmr" WHERE "userId"=${userId}`;
  await tx.$executeRaw`INSERT INTO "MmrReviewEvent" (id,"userId","actorId","requestId",fingerprint,action,result,reason) VALUES (${randomUUID()}::uuid,${userId},${userId},${randomUUID()}::uuid,'ONBOARDING','declare',${JSON.stringify(row)}::jsonb,'Declaración inicial del jugador')`;
}
const actions = [
  "declare",
  "review",
  "approve",
  "reject",
  "update",
  "revoke",
  "note",
];
export async function mmrCommand(
  actor: string,
  input: unknown,
  staff = false,
  db = prisma,
) {
  const v = objectInput(
    input,
    staff
      ? [
          "action",
          "userId",
          "value",
          "reason",
          "evidence",
          "expectedRevision",
          "requestId",
        ]
      : ["value", "expectedRevision", "requestId"],
  );
  const action = staff ? String(v.action) : "declare",
    subject = staff ? String(v.userId ?? "") : actor;
  if (
    !actions.includes(action) ||
    (staff && action === "declare") ||
    !subject ||
    subject.length > 200 ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.requestId,
    ) ||
    !Number.isSafeInteger(v.expectedRevision) ||
    Number(v.expectedRevision) < 0
  )
    throw new AccountError("Operación de MMR no válida.");
  let value: number | undefined;
  if (action === "declare" || action === "approve") {
    try {
      value = validateMmr(v.value);
    } catch (e) {
      throw new AccountError((e as Error).message);
    }
  } else if (v.value !== undefined)
    throw new AccountError("Valor no permitido para esta acción.");
  const reason = staff
    ? plainText(v.reason, "Motivo", 1000)
    : "Declaración del jugador";
  const evidence =
    staff && v.evidence !== undefined
      ? plainText(v.evidence, "Evidencia voluntaria", 2000, false)
      : "";
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        action,
        subject,
        value,
        reason,
        evidence,
        revision: v.expectedRevision,
      }),
    )
    .digest("hex");
  const result = await db.$transaction(async (tx) => {
    if (!(await mmrInstalled(tx)))
      throw new AccountError(
        "El sistema de MMR está pendiente de activación.",
        503,
      );
    // Lock grants before reading them: a revoked grant cannot race a decision.
    if (staff) {
      // The same authorization fence used by OWNER permission edits also
      // protects a MODERATOR decision from a concurrent mmr.verify revocation.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('draftory-staff-authorization'))::text`;
      await tx.$queryRaw`SELECT "userId" FROM "StaffAuthorization" WHERE "userId"=${actor} FOR SHARE`;
      const access = await requirePermission(actor, "users.view", tx);
      const deciding = ["approve", "reject", "revoke"].includes(action);
      if (actor === subject)
        throw new AccountError(
          "No puedes revisar ni verificar tu propio MMR. Solicita la revisión de otro miembro autorizado de Staff.",
          403,
        );
      if (access.role === "MODERATOR" && ["reject", "revoke"].includes(action))
        throw new AccountError(
          "MODERATOR puede revisar, corregir y aprobar MMR. Rechazar o revocar una verificación requiere OWNER o ADMIN.",
          403,
        );
      if (
        (deciding &&
          (!access.permissions.includes("mmr.verify") ||
            !["OWNER", "ADMIN", "MODERATOR"].includes(access.role))) ||
        (["review", "update"].includes(action) &&
          !["OWNER", "ADMIN", "MODERATOR"].includes(access.role))
      )
        throw new AccountError(
          "No tienes permiso para esta decisión de MMR.",
          403,
        );
    }
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor + ":" + v.requestId},21721))::text`;
    const [oldEvent] = await tx.$queryRaw<
      { fingerprint: string; result: unknown }[]
    >`SELECT fingerprint,result FROM "MmrReviewEvent" WHERE "actorId"=${actor} AND "requestId"=${v.requestId}::uuid`;
    if (oldEvent) {
      if (oldEvent.fingerprint !== fingerprint)
        throw new AccountError(
          "Identificador reutilizado con otros datos.",
          409,
        );
      return oldEvent.result;
    }
    const [user] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT u.id FROM "User" u JOIN "Profile" p ON p."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id WHERE u.id=${subject} AND l."deletedAt" IS NULL FOR UPDATE OF u`;
    if (!user) throw new AccountError("Jugador no disponible.", 404);
    const [row] = await tx.$queryRaw<
      MmrRow[]
    >`SELECT * FROM "CompetitiveMmr" WHERE "userId"=${subject} FOR UPDATE`;
    if ((row?.revision ?? 0) !== v.expectedRevision)
      throw new AccountError(
        "El MMR cambió. Actualiza la ficha antes de continuar.",
        409,
      );
    if (!row && action !== "declare")
      throw new AccountError("El jugador todavía no ha declarado MMR.", 409);
    if (action === "declare" && row) {
      const [count] = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int n FROM "MmrReviewEvent" WHERE "userId"=${subject} AND action='declare' AND "createdAt">clock_timestamp()-interval '24 hours'`;
      if (count.n >= 3)
        throw new AccountError(
          "Ya has enviado tres actualizaciones hoy. Contacta con Staff si necesitas ayuda.",
          429,
        );
    }
    if (action === "declare") {
      await tx.$executeRaw`INSERT INTO "CompetitiveMmr" ("userId",declared) VALUES (${subject},${value!}) ON CONFLICT ("userId") DO UPDATE SET declared=EXCLUDED.declared,status=CASE WHEN "CompetitiveMmr".approved IS NOT NULL THEN 'UNDER_REVIEW' ELSE 'UNVERIFIED' END,"declaredAt"=clock_timestamp(),"updatedAt"=clock_timestamp(),revision="CompetitiveMmr".revision+1`;
    } else {
      const next =
        action === "approve"
          ? "VERIFIED"
          : action === "review"
            ? "UNDER_REVIEW"
            : action === "reject"
              ? "REJECTED"
              : action === "update" || action === "revoke"
                ? "NEEDS_UPDATE"
                : row.status;
      await tx.$executeRaw`UPDATE "CompetitiveMmr" SET status=${next},approved=${action === "approve" ? value! : action === "revoke" ? null : row.approved},"verifiedAt"=${action === "approve" ? new Date() : action === "revoke" ? null : row.verifiedAt},"reviewerId"=${action === "approve" ? actor : row.reviewerId},revision=revision+1,"updatedAt"=clock_timestamp() WHERE "userId"=${subject}`;
    }
    const [updated] = await tx.$queryRaw<
      MmrRow[]
    >`SELECT * FROM "CompetitiveMmr" WHERE "userId"=${subject}`;
    const event = randomUUID(),
      result = JSON.parse(JSON.stringify(updated));
    await tx.$executeRaw`INSERT INTO "MmrReviewEvent" (id,"userId","actorId","requestId",fingerprint,action,previous,result,reason,evidence) VALUES (${event}::uuid,${subject},${actor},${v.requestId}::uuid,${fingerprint},${action},${JSON.stringify(row ?? null)}::jsonb,${JSON.stringify(result)}::jsonb,${reason},${evidence})`;
    if (staff && action !== "note")
      await tx.notification.create({
        data: {
          id: "mmr:" + event,
          userId: subject,
          type: "MMR_REVIEW",
          payload: {
            description:
              action === "approve"
                ? "Staff ha verificado tu MMR. Consulta el valor actualizado en tu perfil."
                : "Tu revisión de MMR tiene una actualización. Consulta Configuración.",
            href: "/configuracion?tab=mmr",
          },
        },
      });
    return result;
  });
  // Commit the subject lock before touching rooms: room commands lock in the
  // opposite order. Failure here never rolls back an already audited decision;
  // an idempotent replay retries the refresh, without duplicate notifications.
  await db.$executeRaw`UPDATE "Room" SET revision=revision+1 WHERE phase IN ('WAITING','CHOOSING_CAPTAINS','DECIDING_FIRST_PICK','DRAFTING','READY') AND id IN (SELECT "roomId" FROM "RoomMember" WHERE "userId"=${subject} AND "leftAt" IS NULL)`;
  return result;
}

export async function staffMmrFeed(
  actor: string,
  params: URLSearchParams,
  db = prisma,
) {
  const access = await requirePermission(actor, "users.view", db);
  if (!(await mmrInstalled(db)))
    return {
      installed: false,
      maximum: mmrMaximum(),
      items: [],
      page: 1,
      pages: 1,
    };
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  if (!Number.isInteger(page)) throw new AccountError("Página no válida.");
  const search = (params.get("search") ?? "").trim().slice(0, 80),
    status = params.get("status") ?? "";
  if (status && !mmrStates.includes(status as MmrState))
    throw new AccountError("Estado no válido.");
  const sort = params.get("sort") ?? "updated_desc";
  if (!["updated_desc", "oldest", "declared_desc"].includes(sort))
    throw new AccountError("Orden no valido.");
  const order =
    sort === "oldest"
      ? Prisma.sql`m."updatedAt" ASC,m."userId"`
      : sort === "declared_desc"
        ? Prisma.sql`m.declared DESC,m."userId"`
        : Prisma.sql`m."updatedAt" DESC,m."userId"`;
  const where = Prisma.sql`WHERE (${status}='' OR m.status=${status}) AND (${search}='' OR u."displayName" ILIKE ${"%" + search + "%"} OR d."publicId"=${search}) AND l."deletedAt" IS NULL`;
  const items = await db.$queryRaw<
    (MmrRow & {
      name: string;
      avatar: string | null;
      publicId: string | null;
      steamId: string | null;
      reviewer: string | null;
    })[]
  >`SELECT m.*,u."displayName" name,COALESCE(u."customAvatarUrl",u.avatar) avatar,d."publicId",u."steamId",reviewer."displayName" reviewer FROM "CompetitiveMmr" m JOIN "User" u ON u.id=m."userId" LEFT JOIN "DraftoryIdentity" d ON d."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id LEFT JOIN "User" reviewer ON reviewer.id=m."reviewerId" ${where} ORDER BY ${order} LIMIT 20 OFFSET ${(page - 1) * 20}`;
  const [count] = await db.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int n FROM "CompetitiveMmr" m JOIN "User" u ON u.id=m."userId" LEFT JOIN "DraftoryIdentity" d ON d."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id ${where}`;
  const target = params.get("userId");
  const totals = await db.$queryRaw<
    { status: MmrState; n: number }[]
  >`SELECT m.status,count(*)::int n FROM "CompetitiveMmr" m LEFT JOIN "AccountLifecycle" l ON l."userId"=m."userId" WHERE l."deletedAt" IS NULL GROUP BY m.status`;
  const history = target
    ? await db.$queryRaw<
        unknown[]
      >`SELECT e.*,u."displayName" actor FROM "MmrReviewEvent" e JOIN "User" u ON u.id=e."actorId" WHERE e."userId"=${target} ORDER BY e."createdAt" DESC,e.id LIMIT 50`
    : [];
  const competitive = target
    ? await db.$queryRaw<
        {
          id: string;
          mode: string;
          finishedAt: Date;
          winningSide: string;
          teamSide: string;
          roomRole: string | null;
        }[]
      >`SELECT m.id,m.mode,m."finishedAt",m."winningSide",p."teamSide",p."roomRole" FROM "MatchPlayer" p JOIN "Match" m ON m.id=p."matchId" WHERE p."userId"=${target} AND ${verifiedDraftorySql} ORDER BY m."finishedAt" DESC,m.id LIMIT 10`
    : [];
  return {
    installed: true,
    viewerId: actor,
    capabilities: {
      review: ["OWNER", "ADMIN", "MODERATOR"].includes(access.role),
      verify:
        access.permissions.includes("mmr.verify") &&
        ["OWNER", "ADMIN", "MODERATOR"].includes(access.role),
      rejectOrRevoke:
        access.permissions.includes("mmr.verify") &&
        ["OWNER", "ADMIN"].includes(access.role),
    },
    maximum: mmrMaximum(),
    items,
    total: count.n,
    totals,
    page,
    pages: Math.max(1, Math.ceil(count.n / 20)),
    history,
    competitive,
  };
}
