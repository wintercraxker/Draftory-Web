import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { AccountError } from "./errors";

export const staffPermissions = [
  "users.view",
  "users.search",
  "reports.view",
  "reports.resolve",
  "history.view",
  "users.warn",
  "users.mute",
  "users.suspend",
  "users.ban",
  "users.revoke",
  "messages.moderate",
  "rooms.moderate",
  "rooms.kick",
  "staff.manage",
  "staff.assign",
  "permissions.configure",
  "audit.view",
  "medals.verify",
  "mmr.verify",
] as const;
export type StaffPermission = (typeof staffPermissions)[number];
export const staffRoles = [
  "USER",
  "HELPER",
  "MODERATOR",
  "ADMIN",
  "OWNER",
] as const;
export type StaffRole = (typeof staffRoles)[number];
const defaults: Record<StaffRole, readonly StaffPermission[]> = {
  USER: [],
  HELPER: [
    "users.view",
    "users.search",
    "reports.view",
    "reports.resolve",
    "history.view",
  ],
  MODERATOR: [
    "users.view",
    "users.search",
    "reports.view",
    "reports.resolve",
    "history.view",
    "users.warn",
    "users.mute",
    "users.suspend",
    "users.revoke",
    "messages.moderate",
    "rooms.moderate",
    "rooms.kick",
  ],
  ADMIN: staffPermissions.filter(
    (p) =>
      !["staff.manage", "staff.assign", "permissions.configure"].includes(p),
  ),
  OWNER: staffPermissions,
};
type Db = Pick<
  Prisma.TransactionClient,
  "staffAuthorization" | "staffRolePermission"
>;
export function defaultStaffPermissions(role: StaffRole) {
  return [...defaults[role]];
}
export async function staffAccess(userId: string, db: Db = prisma) {
  const grant = await db.staffAuthorization.findUnique({ where: { userId } });
  const role: StaffRole =
    grant && !grant.revokedAt && staffRoles.includes(grant.role as StaffRole)
      ? (grant.role as StaffRole)
      : "USER";
  const permissions = new Set<StaffPermission>(defaults[role]);
  if (role !== "OWNER" && role !== "USER")
    for (const rule of await db.staffRolePermission.findMany({
      where: { role },
    })) {
      if (staffPermissions.includes(rule.permission as StaffPermission)) {
        if (rule.allowed) permissions.add(rule.permission as StaffPermission);
        else permissions.delete(rule.permission as StaffPermission);
      }
    }
  return { role, permissions: [...permissions] };
}
export async function requirePermission(
  userId: string,
  permission?: StaffPermission,
  db: Db = prisma,
) {
  const access = await staffAccess(userId, db);
  if (
    access.role === "USER" ||
    (permission && !access.permissions.includes(permission))
  )
    throw new AccountError("No tienes permiso para esta operación.", 403);
  return access;
}
export async function protectStaffTarget(
  actorId: string,
  targetId: string,
  db: Db = prisma,
) {
  const [actor, target] = await Promise.all([
    staffAccess(actorId, db),
    staffAccess(targetId, db),
  ]);
  if (
    actorId === targetId ||
    staffRoles.indexOf(actor.role) <= staffRoles.indexOf(target.role)
  )
    throw new AccountError(
      "No puedes modificar tu cuenta ni la de un miembro de igual o mayor autoridad.",
      403,
    );
}
