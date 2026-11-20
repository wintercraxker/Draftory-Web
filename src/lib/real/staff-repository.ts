import { reportDecisions } from "../report-decisions";
import { sanctionEnd } from "../sanction-duration";
import {
  lockedReport,
  reportInterventionState,
  sanctionActions,
  sanctionPermission,
  interventionFingerprint,
} from "./report-interventions";
import { publicStaffEvidence } from "./private-report-images";
import "server-only";
import { prisma } from "../prisma";
import { AccountError, objectInput, plainText } from "./http";
import {
  protectStaffTarget,
  requirePermission,
  staffAccess,
  staffPermissions,
  staffRoles,
  defaultStaffPermissions,
  type StaffPermission,
} from "./staff-access";
import { withdrawPresenceMember } from "./room-presence";
import { assertParticipation } from "./suspension";
import { readHomeStatistics } from "./home-statistics";
import type { Prisma } from "../../generated/prisma/client";
import { reportCategories } from "../moderation-config";
import { sanctionCategories } from "../sanction-categories";

const staffIdentitySelect = {
  id: true,
  displayName: true,
  username: true,
  avatar: true,
  customAvatarUrl: true,
  draftoryIdentity: { select: { publicId: true } },
} as const;

const permissionFor: Record<string, StaffPermission> = {
  warn: "users.warn",
  mute: "users.mute",
  suspend: "users.suspend",
  ban: "users.ban",
  revoke: "users.revoke",
  resolveReport: "reports.resolve",
  assignReport: "reports.resolve",
  prepareReportIntervention: "reports.resolve",
  cancelReportIntervention: "reports.resolve",
  verifyMedal: "medals.verify",
  setRole: "staff.assign",
  setPermission: "permissions.configure",
  hideMessage: "messages.moderate",
  kickRoom: "rooms.kick",
  closeRoom: "rooms.moderate",
};

export async function staffDashboard(
  actorId: string,
  search = "",
  db = prisma,
  page = 1,
  pageSize = 30,
) {
  if (typeof search !== "string" || search.length > 128)
    throw new AccountError("Búsqueda inválida.");
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new AccountError("Página inválida.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 30)
    throw new AccountError("Tamaño de página inválido.");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('draftory-staff-authorization'))`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actorId} FOR UPDATE`;
      const access = await requirePermission(actorId, undefined, tx);
      await assertParticipation(tx, [actorId]);
      if (
        (await tx.staffAuditLog.count({
          where: { actorId, createdAt: { gt: new Date(Date.now() - 60000) } },
        })) >= 90
      )
        throw new AccountError("Espera antes de consultar de nuevo.", 429);
      const data = await dashboardSnapshot(
        actorId,
        search.slice(0, 128),
        tx,
        page,
        pageSize,
      );
      await tx.staffAuditLog.create({
        data: {
          actorId,
          permission: search
            ? "users.search"
            : access.permissions.includes("users.view")
              ? "users.view"
              : "reports.view",
          action: search ? "searchStaff" : "readStaff",
          reason: "Consulta del panel de moderación",
          result: "SUCCESS",
          changes: { search: search.slice(0, 128) },
        },
      });
      return data;
    },
    { timeout: 15000 },
  );
}
async function dashboardSnapshot(
  actorId: string,
  search: string,
  db: Prisma.TransactionClient,
  page: number,
  pageSize: number,
) {
  const access = await requirePermission(actorId, undefined, db);
  if (search) await requirePermission(actorId, "users.search", db);
  const can = (p: StaffPermission) => access.permissions.includes(p);
  const moduleErrors: string[] = [];
  async function readModule<T>(
    name: string,
    run: () => Promise<T>,
    fallback: NoInfer<T>,
  ): Promise<T> {
    await db.$executeRawUnsafe("SAVEPOINT staff_read_module");
    try {
      const result = await run();
      await db.$executeRawUnsafe("RELEASE SAVEPOINT staff_read_module");
      return result;
    } catch (error) {
      await db.$executeRawUnsafe("ROLLBACK TO SAVEPOINT staff_read_module");
      await db.$executeRawUnsafe("RELEASE SAVEPOINT staff_read_module");
      if (error instanceof AccountError) throw error;
      if (!moduleErrors.includes(name)) moduleErrors.push(name);
      const e = error as { name?: string; code?: string };
      console.error(
        "STAFF_MODULE_READ_FAILED",
        JSON.stringify({ module: name, name: e.name, code: e.code }),
      );
      return fallback;
    }
  }

  const userWhere: Prisma.UserWhereInput = search
    ? {
        OR: [
          { id: search },
          { steamId: search },
          { username: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
          { draftoryIdentity: { publicId: search.toUpperCase() } },
        ],
      }
    : {};
  const userCount = await readModule(
    "users",
    async () =>
      can("users.view") ? await db.user.count({ where: userWhere }) : 0,
    0,
  );
  const users = await readModule(
    "users",
    async () =>
      can("users.view")
        ? await db.user.findMany({
            where: userWhere,
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              customAvatarUrl: true,
              steamId: true,
              createdAt: true,
              draftoryIdentity: { select: { publicId: true } },
              staffAuthorization: { select: { role: true, revokedAt: true } },
              manualMedal: { select: { rankTier: true, state: true } },
              sanctionsReceived: {
                where: {
                  state: "ACTIVE",
                  startsAt: { lte: new Date() },
                  OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
                },
                select: { kind: true },
                take: 20,
              },
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          })
        : [],
    [],
  );
  const now = new Date();
  const registered = await readModule(
    "overview",
    async () => (can("users.view") ? db.user.count() : null),
    null,
  );
  const suspended = await readModule(
    "overview",
    async () =>
      can("history.view")
        ? db.playerSanction.groupBy({
            by: ["userId"],
            where: {
              state: "ACTIVE",
              kind: { in: ["SUSPENSION", "PERMANENT"] },
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
          })
        : null,
    null,
  );
  const pending = await readModule(
    "overview",
    async () =>
      can("reports.view")
        ? db.playerReport.count({ where: { status: "OPEN" } })
        : null,
    null,
  );
  const resolved = await readModule(
    "overview",
    async () =>
      can("reports.view")
        ? db.playerReport.count({ where: { status: "REVIEWED" } })
        : null,
    null,
  );
  const rooms = await readModule(
    "rooms",
    async () =>
      can("rooms.moderate") || can("rooms.kick") || can("messages.moderate")
        ? db.room.findMany({
            where: {
              closedAt: null,
              phase: { notIn: ["FINISHED", "CANCELLED"] },
            },
            select: {
              id: true,
              name: true,
              phase: true,
              creatorId: true,
              creator: { select: staffIdentitySelect },
              publicIdentity: { select: { publicId: true } },
              matches: {
                where: {
                  status: { in: ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"] },
                },
                select: { id: true },
                take: 1,
              },
              members: {
                where: { leftAt: null },
                select: {
                  userId: true,
                  team: true,
                  user: { select: staffIdentitySelect },
                },
                take: 20,
              },
              messages: {
                where: { kind: "USER" },
                select: {
                  id: true,
                  authorId: true,
                  author: { select: staffIdentitySelect },
                  body: true,
                  createdAt: true,
                },
                take: can("messages.moderate") ? 5 : 0,
                orderBy: { createdAt: "desc" },
              },
            },
            take: 30,
            orderBy: { createdAt: "desc" },
          })
        : [],
    [],
  );
  const reports = await readModule(
    "reports",
    async () =>
      can("reports.view")
        ? db.playerReport.findMany({
            where: search
              ? { reportedUserId: { in: users.map((u) => u.id) } }
              : {},
            take: 50,
            orderBy: { createdAt: "desc" },
            include: {
              reporter: { select: staffIdentitySelect },
              reportedUser: { select: staffIdentitySelect },
              assignedTo: { select: staffIdentitySelect },
            },
          })
        : [],
    [],
  );
  const sanctions = await readModule(
    "sanctions",
    async () =>
      can("history.view")
        ? db.playerSanction.findMany({
            where: search ? { userId: { in: users.map((u) => u.id) } } : {},
            take: 50,
            orderBy: { createdAt: "desc" },
            include: {
              user: { select: staffIdentitySelect },
              admin: { select: staffIdentitySelect },
              revokedBy: { select: staffIdentitySelect },
            },
          })
        : [],
    [],
  );
  const audit = await readModule(
    "audit",
    async () =>
      can("audit.view")
        ? db.staffAuditLog.findMany({
            where:
              access.role === "OWNER"
                ? {}
                : {
                    NOT: [
                      { action: { startsWith: "bot" } },
                      { action: "provisionPublicDiagnosticWorkers" },
                      { action: "activatePublicCompetitiveWorkerGrants" },
                    ],
                  },
            take: 50,
            orderBy: { createdAt: "desc" },
            include: {
              actor: { select: staffIdentitySelect },
              target: { select: staffIdentitySelect },
            },
          })
        : [],
    [],
  );
  const roles = await readModule(
    "staff",
    async () =>
      can("permissions.configure") ? db.staffRolePermission.findMany() : [],
    [],
  );
  const activeRooms = await readModule(
    "overview",
    async () =>
      can("rooms.moderate") ? (await readHomeStatistics(db)).activeRooms : null,
    null,
  );
  const staffCount = await readModule(
    "staff",
    () =>
      db.staffAuthorization.count({
        where: {
          revokedAt: null,
          role: { in: ["OWNER", "ADMIN", "MODERATOR", "HELPER"] },
        },
      }),
    0,
  );
  const staffMembers = await readModule(
    "staff",
    async () =>
      access.role === "OWNER"
        ? await db.staffAuthorization.findMany({
            where: {
              revokedAt: null,
              role: { in: ["OWNER", "ADMIN", "MODERATOR", "HELPER"] },
            },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  avatar: true,
                  customAvatarUrl: true,
                  draftoryIdentity: { select: { publicId: true } },
                },
              },
            },
            orderBy: { grantedAt: "asc" },
          })
        : [],
    [],
  );
  const history = await readModule(
    "users",
    async () =>
      can("history.view") && search
        ? await db.matchPlayer.findMany({
            where: { userId: { in: users.map((u) => u.id) } },
            take: 30,
            orderBy: { joinedAt: "desc" },
            select: {
              userId: true,
              matchId: true,
              teamSide: true,
              match: {
                select: { status: true, winningSide: true, startedAt: true },
              },
            },
          })
        : [],
    [],
  );
  const sanctionRows = await Promise.all(
    sanctions.map(async (s) => ({
      ...s,
      canRevoke:
        can("users.revoke") &&
        s.state === "ACTIVE" &&
        (!s.endsAt || s.endsAt > now) &&
        s.userId !== actorId &&
        staffRoles.indexOf(access.role) >
          staffRoles.indexOf((await staffAccess(s.userId, db)).role) &&
        staffRoles.indexOf(access.role) >=
          staffRoles.indexOf((await staffAccess(s.adminId, db)).role) &&
        (s.kind !== "PERMANENT" || can("users.ban")),
    })),
  );
  const permissionMatrix = can("permissions.configure")
    ? (["HELPER", "MODERATOR", "ADMIN"] as const).map((role) => ({
        role,
        permissions: staffPermissions.map((permission) => {
          const override = roles.find(
            (r) => r.role === role && r.permission === permission,
          );
          const baseline = defaultStaffPermissions(role).includes(permission);
          return {
            permission,
            baseline,
            allowed: override ? override.allowed : baseline,
            source: override ? "EXCEPTION" : "DEFAULT",
          };
        }),
      }))
    : [];
  return {
    serverNow: now.toISOString(),
    access,
    moduleErrors,
    permissionMatrix,
    pagination: {
      page,
      pageSize,
      total: userCount,
      totalPages: Math.max(1, Math.ceil(userCount / pageSize)),
    },
    staffMembers: await Promise.all(
      staffMembers.map(async (m) => ({
        ...m,
        access: await staffAccess(m.userId, db),
      })),
    ),
    users: await Promise.all(
      users.map(async (u) => ({
        ...u,
        accountState: u.sanctionsReceived.some((s) =>
          ["SUSPENSION", "PERMANENT"].includes(s.kind),
        )
          ? "Suspendida"
          : u.sanctionsReceived.some((s) => s.kind === "MUTE")
            ? "Chat silenciado"
            : "Activa",
        access: await staffAccess(u.id, db),
      })),
    ),
    reports: reports.map((r) => ({
      ...r,
      evidence: publicStaffEvidence(r.id, r.evidence),
    })),
    sanctions: sanctionRows,
    audit,
    rooms,
    roles,
    metrics: {
      registered,
      suspended: suspended?.length ?? null,
      pending,
      resolved,
      activeRooms,
      staffCount,
    },
    history,
  };
}

export async function moderateAction(
  actorId: string,
  input: unknown,
  db = prisma,
) {
  try {
    return await performAction(actorId, input, db);
  } catch (error) {
    try {
      const access = await staffAccess(actorId, db);
      if (access.role !== "USER")
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actorId} FOR UPDATE`;
          if (
            (await tx.staffAuditLog.count({
              where: {
                actorId,
                createdAt: { gt: new Date(Date.now() - 60000) },
              },
            })) < 90
          ) {
            const requested =
              input && typeof input === "object" && !Array.isArray(input)
                ? String((input as Record<string, unknown>).action).slice(0, 40)
                : "invalid";
            await tx.staffAuditLog.create({
              data: {
                actorId,
                permission: permissionFor[requested] ?? "unknown",
                action: requested,
                reason: "Solicitud administrativa rechazada",
                result: "REJECTED",
                changes: {
                  status: error instanceof AccountError ? error.status : 503,
                  ...(input &&
                  typeof input === "object" &&
                  typeof (input as Record<string, unknown>).reportId ===
                    "string"
                    ? {
                        reportId: String(
                          (input as Record<string, unknown>).reportId,
                        ).slice(0, 128),
                        ...(typeof (input as Record<string, unknown>)
                          .interventionId === "string"
                          ? {
                              interventionId: String(
                                (input as Record<string, unknown>)
                                  .interventionId,
                              ).slice(0, 80),
                            }
                          : {}),
                      }
                    : {}),
                },
              },
            });
          }
        });
    } catch {
      /* Original action fails closed even if the rejection journal is unavailable. */
    }
    throw error;
  }
}
async function performAction(actorId: string, input: unknown, db = prisma) {
  const v = objectInput(input, [
    "action",
    "userId",
    "reportId",
    "sanctionId",
    "publicReason",
    "publicCategory",
    "requestId",
    "internalNote",
    "endsAt",
    "resolution",
    "role",
    "permission",
    "allowed",
    "roomId",
    "messageId",
    "durationMinutes",
    "ownerExceptionConfirmed",
    "interventionId",
    "interventionAction",
    "decision",
  ]);
  const action = plainText(v.action, "Acción", 40),
    permission = permissionFor[action];
  if (!permission) throw new AccountError("Acción inválida.");
  await requirePermission(actorId, permission, db);
  const reason = plainText(v.publicReason ?? v.resolution, "Motivo", 500);
  const requestId =
    v.requestId === undefined ? null : plainText(v.requestId, "Solicitud", 80);
  if (requestId && !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))
    throw new AccountError("Identificador de solicitud inválido.");
  if (
    v.publicCategory !== undefined &&
    !Object.hasOwn(sanctionCategories, String(v.publicCategory))
  )
    throw new AccountError("Categoría pública inválida.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('draftory-staff-authorization'))`;
    // Room lifecycle uses room-before-user locking. Follow the same order.
    if (["kickRoom", "closeRoom", "hideMessage"].includes(action)) {
      const roomId = plainText(v.roomId, "Sala", 128);
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE`;
    }
    const target =
      typeof v.userId === "string" ? plainText(v.userId, "Usuario", 128) : null;
    for (const id of [
      ...new Set([actorId, ...(target ? [target] : [])]),
    ].sort())
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
    const actor = await requirePermission(actorId, permission, tx);
    await assertParticipation(tx, [actorId]);
    if (
      (await tx.staffAuditLog.count({
        where: {
          actorId,
          createdAt: { gt: new Date(Date.now() - 60000) },
          action: { notIn: ["readStaff", "searchStaff", "readReports"] },
          result: { in: ["SUCCESS", "REJECTED", "REPLAY"] },
        },
      })) >= 30
    )
      throw new AccountError("Demasiadas acciones. Espera un minuto.", 429);
    if (requestId) {
      const previous = await tx.staffAuditLog.findFirst({
        where: {
          actorId,
          result: "SUCCESS",
          changes: { path: ["requestId"], equals: requestId },
        },
        select: { action: true, targetId: true, changes: true },
      });
      if (previous) {
        const old = previous.changes as Record<string, Prisma.JsonValue>;
        // A key cannot be repurposed for another payload, action, or target.
        if (old.requestPayload !== JSON.stringify(v))
          throw new AccountError(
            "Solicitud reutilizada con datos diferentes.",
            409,
          );
        await tx.staffAuditLog.create({
          data: {
            actorId,
            targetId: target,
            permission,
            action,
            reason: "Solicitud repetida sin nueva mutación",
            result: "REPLAY",
            changes: { requestId },
          },
        });
        return old.response;
      }
    }
    if (
      target &&
      !(await tx.user.findUnique({
        where: { id: target },
        select: { id: true },
      }))
    )
      throw new AccountError("Usuario no disponible.", 404);
    let changes: Prisma.InputJsonValue = {},
      result: unknown = { ok: true };
    const now = new Date();
    if (
      [
        "warn",
        "mute",
        "suspend",
        "ban",
        "setRole",
        "verifyMedal",
        "kickRoom",
      ].includes(action)
    ) {
      if (!target) throw new AccountError("Selecciona un usuario.");
      await protectStaffTarget(actorId, target, tx);
    }
    let reportException = false;
    if (
      ["prepareReportIntervention", "cancelReportIntervention"].includes(action)
    ) {
      if (!requestId)
        throw new AccountError("Identificador de solicitud obligatorio.");
      const id = plainText(v.reportId, "Reporte", 128),
        checked = await lockedReport(
          tx,
          actorId,
          actor.role,
          id,
          v.ownerExceptionConfirmed,
        );
      reportException = checked.exception;
      const current = await reportInterventionState(tx, id);
      if (action === "cancelReportIntervention") {
        if (
          !["PENDING", "FAILED"].includes(current.state) ||
          v.interventionId !== current.id
        )
          throw new AccountError(
            "La intervención ya cambió. Actualiza el caso.",
            409,
          );
        changes = {
          reportId: id,
          interventionId: current.id,
          ownerException: reportException,
        };
      } else {
        const proposed = String(v.interventionAction);
        if (!sanctionActions.includes(proposed))
          throw new AccountError("Intervención inválida.");
        await requirePermission(actorId, sanctionPermission[proposed], tx);
        if (target !== checked.row.reportedUserId)
          throw new AccountError("Reporte incompatible.");
        await protectStaffTarget(actorId, target!, tx);
        if (["PENDING", "FAILED"].includes(current.state))
          throw new AccountError(
            "Existe una intervención pendiente o fallida. Reinténtala o cancélala antes de continuar.",
            409,
          );
        try {
          sanctionEnd(proposed, v, now);
        } catch (e) {
          throw new AccountError((e as Error).message);
        }
        if (v.internalNote) plainText(v.internalNote, "Nota", 2000);
        changes = {
          reportId: id,
          interventionId: requestId,
          fingerprint: interventionFingerprint(v, proposed),
          ownerException: reportException,
        };
        result = { ok: true, interventionId: requestId };
      }
    } else if (["warn", "mute", "suspend", "ban"].includes(action)) {
      const kind = (
        {
          warn: "WARNING",
          mute: "MUTE",
          suspend: "SUSPENSION",
          ban: "PERMANENT",
        } as const
      )[action as "warn" | "mute" | "suspend" | "ban"];
      let end: Date | null;
      try {
        end = sanctionEnd(action, v, now);
      } catch (e) {
        throw new AccountError((e as Error).message);
      }
      if (
        actor.role === "MODERATOR" &&
        end &&
        end.getTime() - now.getTime() > 7 * 86400000
      )
        throw new AccountError(
          "Moderación: duración máxima de siete días.",
          403,
        );
      if (
        kind !== "WARNING" &&
        (await tx.playerSanction.findFirst({
          where: {
            userId: target!,
            state: "ACTIVE",
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            kind: {
              in: kind === "MUTE" ? ["MUTE"] : ["SUSPENSION", "PERMANENT"],
            },
          },
        }))
      )
        throw new AccountError(
          "Ya existe una sanción activa de este tipo.",
          409,
        );
      if (v.reportId) {
        const checked = await lockedReport(
          tx,
          actorId,
          actor.role,
          plainText(v.reportId, "Reporte", 128),
          v.ownerExceptionConfirmed,
        );
        reportException = checked.exception;
        if (checked.row.reportedUserId !== target)
          throw new AccountError("Reporte incompatible.");
        const current = await reportInterventionState(tx, checked.row.id);
        if (
          !["PENDING", "FAILED"].includes(current.state) ||
          current.actorId !== actorId ||
          v.interventionId !== current.id ||
          current.fingerprint !== interventionFingerprint(v, action)
        )
          throw new AccountError(
            "Confirma primero la preparación vigente de esta intervención.",
            409,
          );
      }
      const sanction = await tx.playerSanction.create({
        data: {
          userId: target!,
          adminId: actorId,
          kind,
          publicReason: reason,
          internalNote: v.internalNote
            ? plainText(v.internalNote, "Nota", 2000)
            : null,
          startsAt: now,
          endsAt: end,
          reportId: v.reportId ? String(v.reportId) : null,
        },
      });
      await tx.notification.create({
        data: {
          id: `sanction:${sanction.id}`,
          userId: target!,
          type:
            kind === "WARNING"
              ? "MODERATION_WARNING"
              : kind === "MUTE"
                ? "MODERATION_MUTE"
                : "SUSPENSION",
          payload: {
            description: reason,
            href: "/reglas",
            sanctionId: sanction.id,
            kind,
            startsAt: now.toISOString(),
            endsAt: end?.toISOString() ?? null,
            publicCategory: String(v.publicCategory ?? "COMMUNITY_RULES"),
          },
        },
      });
      changes = {
        sanctionId: sanction.id,
        kind,
        endsAt: end?.toISOString() ?? null,
        ...(v.reportId
          ? {
              reportId: String(v.reportId),
              interventionId: String(v.interventionId),
              ownerException: reportException,
            }
          : {}),
      };
      result = {
        id: sanction.id,
        startsAt: now.toISOString(),
        endsAt: end?.toISOString() ?? null,
      };
    } else if (action === "revoke") {
      const row = await tx.playerSanction.findUnique({
        where: { id: plainText(v.sanctionId, "Sanción", 128) },
      });
      if (!row || row.userId !== target)
        throw new AccountError("Sanción incompatible.");
      await protectStaffTarget(actorId, row.userId, tx);
      if (
        staffRoles.indexOf(actor.role) <
        staffRoles.indexOf((await staffAccess(row.adminId, tx)).role)
      )
        throw new AccountError(
          "Un miembro de mayor autoridad debe revisar esta revocación.",
          403,
        );
      if (row.kind === "PERMANENT")
        await requirePermission(actorId, "users.ban", tx);
      if (row.state !== "ACTIVE" || (row.endsAt && row.endsAt <= now))
        throw new AccountError("La sanción ya no está activa.", 409);
      const changed = await tx.playerSanction.updateMany({
        where: { id: row.id, state: "ACTIVE" },
        data: { state: "REVOKED", revokedAt: now, revokedById: actorId },
      });
      if (changed.count)
        await tx.notification.create({
          data: {
            id: `sanction-revoked:${row.id}`,
            userId: row.userId,
            type: "SUSPENSION_REVOKED",
            payload: {
              description: reason,
              href: "/reglas",
              sanctionId: row.id,
              kind: row.kind,
              endsAt: row.endsAt?.toISOString() ?? null,
            },
          },
        });
      changes = {
        sanctionId: row.id,
        changed: changed.count,
        reportId: row.reportId,
      };
    } else if (action === "resolveReport" || action === "assignReport") {
      const id = plainText(v.reportId, "Reporte", 128);
      const checked = await lockedReport(
        tx,
        actorId,
        actor.role,
        id,
        v.ownerExceptionConfirmed,
        action === "resolveReport",
      );
      const row = checked.row;
      reportException = checked.exception;
      if (
        action === "resolveReport" &&
        ["PENDING", "FAILED"].includes(
          (await reportInterventionState(tx, id)).state,
        )
      )
        throw new AccountError(
          "Debes completar o cancelar la intervención pendiente o fallida antes de resolver el reporte.",
          409,
        );
      if (action === "resolveReport" && reason.length < 3)
        throw new AccountError(
          "Escribe una conclusión de al menos 3 caracteres.",
        );
      if (
        action === "resolveReport" &&
        v.decision !== undefined &&
        (typeof v.decision !== "string" ||
          !Object.hasOwn(reportDecisions, v.decision))
      )
        throw new AccountError("Selecciona una decisión válida.");
      const alreadyAssigned =
        action === "assignReport" && row.assignedToId === actorId;
      if (!alreadyAssigned) {
        const updated = await tx.playerReport.updateMany({
          where: {
            id,
            status: "OPEN",
            assignedToId: action === "assignReport" ? null : actorId,
          },
          data:
            action === "assignReport"
              ? { assignedToId: actorId }
              : {
                  status: "REVIEWED",
                  reviewedAt: now,
                  reviewedById: actorId,
                  resolution: reason,
                },
        });
        if (updated.count !== 1)
          throw new AccountError(
            "El reporte cambió. Actualiza el caso antes de continuar.",
            409,
          );
      }
      changes = {
        reportId: id,
        assignedToId: actorId,
        ownerException: reportException,
        ...(action === "resolveReport"
          ? {
              ...(typeof v.decision === "string"
                ? { decision: v.decision }
                : {}),
              interventionOutcome: (await tx.playerSanction.count({
                where: { reportId: id },
              }))
                ? "LINKED_SANCTIONS"
                : "NO_SANCTION",
            }
          : {}),
        alreadyAssigned,
        ...(action === "assignReport" && !alreadyAssigned
          ? { assignedAt: now.toISOString() }
          : {}),
        resolution: action === "resolveReport" ? reason : null,
      };
      result = {
        ok: true,
        reportId: id,
        assignedToId: actorId,
        status: action === "resolveReport" ? "REVIEWED" : "OPEN",
        alreadyAssigned,
      };
    } else if (action === "setRole") {
      await requirePermission(actorId, "staff.manage", tx);
      // Ownership is provisioned locally once; never transferable by HTTP.
      if (
        !staffRoles.includes(v.role as (typeof staffRoles)[number]) ||
        v.role === "OWNER" ||
        staffRoles.indexOf(v.role as (typeof staffRoles)[number]) >=
          staffRoles.indexOf(actor.role)
      )
        throw new AccountError(
          "Solo puedes asignar roles inferiores al tuyo; OWNER no se asigna desde la web.",
          403,
        );
      const before = await tx.staffAuthorization.findUnique({
        where: { userId: target! },
      });
      await tx.staffAuthorization.upsert({
        where: { userId: target! },
        create: { userId: target!, role: String(v.role) },
        update: { role: String(v.role), revokedAt: null, grantedAt: now },
      });
      changes = { from: before?.role ?? "USER", to: String(v.role) };
    } else if (action === "setPermission") {
      if (
        actor.role !== "OWNER" ||
        !["ADMIN", "MODERATOR", "HELPER"].includes(String(v.role)) ||
        !staffPermissions.includes(v.permission as StaffPermission) ||
        typeof v.allowed !== "boolean"
      )
        throw new AccountError("Configuración de permisos no permitida.", 403);
      const key = { role: String(v.role), permission: String(v.permission) };
      await tx.staffRolePermission.upsert({
        where: { role_permission: key },
        create: { ...key, allowed: v.allowed },
        update: { allowed: v.allowed },
      });
      changes = { ...key, allowed: v.allowed };
    } else if (action === "verifyMedal") {
      await tx.manualDotaMedal.update({
        where: { userId: target! },
        data: {
          state: "MANUAL_VERIFIED",
          verifiedAt: now,
          verifiedById: actorId,
        },
      });
      changes = { userId: target!, medalVerified: true };
    } else if (action === "hideMessage") {
      const message = await tx.roomMessage.findFirst({
        where: {
          id: plainText(v.messageId, "Mensaje", 128),
          roomId: String(v.roomId),
          kind: "USER",
        },
      });
      if (!message?.authorId)
        throw new AccountError("Mensaje no disponible.", 404);
      await protectStaffTarget(actorId, message.authorId, tx);
      await tx.roomMessage.update({
        where: { id: message.id },
        data: { body: "[Mensaje retirado por moderación]" },
      });
      changes = {
        messageId: message.id,
        originalBody: message.body,
        roomId: message.roomId,
      };
    } else if (action === "kickRoom" || action === "closeRoom") {
      const room = await tx.room.findUnique({
        where: { id: String(v.roomId) },
      });
      if (
        !room ||
        !["WAITING", "READY"].includes(room.phase) ||
        (await tx.match.count({
          where: {
            roomId: room.id,
            status: { in: ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"] },
          },
        }))
      )
        throw new AccountError(
          "Sala bloqueada por preparación o partida. No se modifica el roster activo.",
          409,
        );
      if (action === "kickRoom")
        await withdrawPresenceMember(tx, room.id, target!, "leave", now);
      else {
        await protectStaffTarget(actorId, room.creatorId, tx);
        await tx.room.update({
          where: { id: room.id },
          data: {
            phase: "CANCELLED",
            closedAt: now,
            revision: { increment: 1 },
          },
        });
        await tx.activeRoomParticipation.deleteMany({
          where: { roomId: room.id },
        });
      }
      changes = { roomId: room.id, action };
    }
    if (requestId)
      changes = {
        ...(changes as Prisma.InputJsonObject),
        requestId,
        requestPayload: JSON.stringify(v),
        response: result as Prisma.InputJsonValue,
      };
    await tx.staffAuditLog.create({
      data: {
        actorId,
        targetId: target,
        permission,
        action,
        reason,
        result: "SUCCESS",
        changes,
      },
    });
    return result;
  });
}

export type StaffReportQuery = {
  page?: number;
  search?: string;
  status?: string;
  category?: string;
  assignee?: string;
  user?: string;
};
export async function staffReports(
  actorId: string,
  query: StaffReportQuery = {},
  db = prisma,
) {
  const page = query.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new AccountError("Página inválida.");
  for (const value of [
    query.search,
    query.category,
    query.assignee,
    query.user,
  ])
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > 128)
    )
      throw new AccountError("Filtro inválido.");
  if (
    query.status &&
    !["OPEN", "REVIEWED", "UNASSIGNED", "ASSIGNED"].includes(query.status)
  )
    throw new AccountError("Estado inválido.");
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext('draftory-staff-authorization'))`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actorId} FOR UPDATE`;
      const access = await requirePermission(actorId, "reports.view", tx);
      await assertParticipation(tx, [actorId]);
      if (
        (await tx.staffAuditLog.count({
          where: { actorId, createdAt: { gt: new Date(Date.now() - 60000) } },
        })) >= 90
      )
        throw new AccountError("Espera antes de consultar de nuevo.", 429);
      const identity = (term: string): Prisma.UserWhereInput => ({
        OR: [
          { id: term },
          { steamId: term },
          { displayName: { contains: term, mode: "insensitive" } },
          { username: { contains: term, mode: "insensitive" } },
          { draftoryIdentity: { publicId: term.toUpperCase() } },
        ],
      });
      const where: Prisma.PlayerReportWhereInput = {
        ...(query.status
          ? {
              status: ["UNASSIGNED", "ASSIGNED"].includes(query.status)
                ? "OPEN"
                : query.status,
            }
          : {}),
        ...(query.status === "UNASSIGNED"
          ? { assignedToId: null }
          : query.status === "ASSIGNED"
            ? { assignedToId: { not: null } }
            : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.assignee
          ? {
              AND: [
                query.assignee === "UNASSIGNED"
                  ? { assignedToId: null }
                  : { assignedTo: identity(query.assignee) },
              ],
            }
          : {}),
        ...(query.user
          ? {
              OR: [
                { reportedUser: identity(query.user) },
                { reporter: identity(query.user) },
              ],
            }
          : {}),
        ...(query.search
          ? {
              AND: [
                ...(query.assignee
                  ? [
                      query.assignee === "UNASSIGNED"
                        ? { assignedToId: null }
                        : { assignedTo: identity(query.assignee) },
                    ]
                  : []),
                {
                  OR: [
                    { id: query.search },
                    {
                      subject: { contains: query.search, mode: "insensitive" },
                    },
                    {
                      description: {
                        contains: query.search,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      };
      const [total, items, categories] = await Promise.all([
        tx.playerReport.count({ where }),
        tx.playerReport.findMany({
          where,
          take: 15,
          skip: (page - 1) * 15,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          include: {
            reporter: { select: staffIdentitySelect },
            reportedUser: { select: staffIdentitySelect },
            assignedTo: { select: staffIdentitySelect },
            reviewedBy: { select: staffIdentitySelect },
          },
        }),
        tx.playerReport.findMany({
          distinct: ["category"],
          select: { category: true },
          take: 100,
          orderBy: { category: "asc" },
        }),
      ]);
      await tx.staffAuditLog.create({
        data: {
          actorId,
          permission: "reports.view",
          action: "readReports",
          reason: "Consulta paginada de reportes",
          result: "SUCCESS",
          changes: {
            page,
            status: query.status ?? "",
            search: query.search ?? "",
          },
        },
      });
      const assignments = items.length
        ? await tx.staffAuditLog.findMany({
            where: {
              action: "assignReport",
              result: "SUCCESS",
              OR: items
                .filter((r) => r.assignedToId)
                .map((r) => ({
                  actorId: r.assignedToId!,
                  changes: { path: ["reportId"], equals: r.id },
                })),
            },
            select: { actorId: true, createdAt: true, changes: true },
            orderBy: { createdAt: "asc" },
          })
        : [];
      const canHistory = access.permissions.includes("history.view");
      const sanctionSelect = {
        id: true,
        userId: true,
        reportId: true,
        kind: true,
        state: true,
        publicReason: true,
        startsAt: true,
        endsAt: true,
        revokedAt: true,
        admin: { select: staffIdentitySelect },
        revokedBy: { select: staffIdentitySelect },
      } as const;
      const enriched = await Promise.all(
        items.map(async (r) => {
          const targetAccess = await staffAccess(r.reportedUserId, tx);
          const canTarget =
            actorId !== r.reportedUserId &&
            staffRoles.indexOf(access.role) >
              staffRoles.indexOf(targetAccess.role);
          const state = await reportInterventionState(tx, r.id);
          const decision = await tx.staffAuditLog.findFirst({
            where: {
              action: "resolveReport",
              result: "SUCCESS",
              changes: { path: ["reportId"], equals: r.id },
            },
            orderBy: { createdAt: "desc" },
            select: { changes: true },
          });
          const linked = canHistory
            ? await tx.playerSanction.findMany({
                where: { reportId: r.id },
                select: sanctionSelect,
                orderBy: { startsAt: "desc" },
                take: 50,
              })
            : [];
          const history = canHistory
            ? await tx.playerSanction.findMany({
                where: { userId: r.reportedUserId },
                select: sanctionSelect,
                orderBy: { startsAt: "desc" },
                take: 20,
              })
            : [];
          return {
            ...r,
            assignedAt:
              assignments.find(
                (a) =>
                  a.actorId === r.assignedToId &&
                  (a.changes as Record<string, unknown>)?.reportId === r.id,
              )?.createdAt ?? null,
            evidence: publicStaffEvidence(r.id, r.evidence),
            availableSanctionActions: canTarget
              ? sanctionActions.filter((a) =>
                  access.permissions.includes(sanctionPermission[a]),
                )
              : [],
            canViewHistory: canHistory,
            linkedSanctions: linked,
            sanctionHistory: history,
            intervention: { state: state.state, id: state.id },
            resolutionOutcome: canHistory
              ? ((decision?.changes as Record<string, unknown>)
                  ?.interventionOutcome ?? null)
              : null,
            resolutionDecision:
              typeof (decision?.changes as Record<string, unknown>)
                ?.decision === "string"
                ? String(
                    (decision!.changes as Record<string, unknown>).decision,
                  )
                : null,
            ownerExceptionRequired:
              access.role === "OWNER" &&
              (r.reporterId === actorId || r.reportedUserId === actorId),
          };
        }),
      );
      return {
        serverNow: new Date().toISOString(),
        actorRole: access.role,
        items: enriched,
        categories: [
          ...new Set([
            ...reportCategories,
            ...categories.map((c) => c.category),
          ]),
        ],
        pagination: {
          page,
          pageSize: 15,
          total,
          totalPages: Math.max(1, Math.ceil(total / 15)),
        },
      };
    },
    { timeout: 15000 },
  );
}
