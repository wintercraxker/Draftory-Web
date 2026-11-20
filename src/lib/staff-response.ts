// These checks protect rendering only. Every operation is still authorized by the server.
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function validStaffAccess(value: unknown): boolean {
  return (
    record(value) &&
    ["OWNER", "ADMIN", "MODERATOR", "HELPER", "USER"].includes(
      String(value.role),
    ) &&
    Array.isArray(value.permissions) &&
    value.permissions.every((p) => typeof p === "string")
  );
}
export function validStaffFeed(value: unknown): boolean {
  if (
    !record(value) ||
    !validStaffAccess(value.access) ||
    !record(value.metrics) ||
    !record(value.pagination)
  )
    return false;
  const arrays = [
    "users",
    "reports",
    "sanctions",
    "audit",
    "rooms",
    "roles",
    "staffMembers",
    "history",
    "permissionMatrix",
    "moduleErrors",
  ];
  if (!arrays.every((k) => Array.isArray(value[k]))) return false;
  const pagination = value.pagination;
  if (
    !["page", "pageSize", "total", "totalPages"].every(
      (k) =>
        typeof pagination[k] === "number" &&
        Number.isInteger(pagination[k]) &&
        Number(pagination[k]) >= (k === "total" ? 0 : 1),
    )
  )
    return false;
  return (
    (value.users as unknown[]).every(
      (u) =>
        record(u) && typeof u.id === "string" && validStaffAccess(u.access),
    ) &&
    (value.rooms as unknown[]).every(
      (r) =>
        record(r) &&
        typeof r.id === "string" &&
        Array.isArray(r.members) &&
        Array.isArray(r.messages) &&
        Array.isArray(r.matches),
    ) &&
    (value.moduleErrors as unknown[]).every((m) =>
      [
        "overview",
        "users",
        "reports",
        "sanctions",
        "rooms",
        "staff",
        "audit",
      ].includes(String(m)),
    )
  );
}
export function validStaffReports(value: unknown): boolean {
  return (
    record(value) &&
    Array.isArray(value.items) &&
    Array.isArray(value.categories) &&
    value.categories.every((c) => typeof c === "string") &&
    record(value.pagination) &&
    ["page", "totalPages", "pageSize", "total"].every((k) =>
      Number.isInteger(
        value.pagination && (value.pagination as Record<string, unknown>)[k],
      ),
    ) &&
    value.items.every(
      (r) =>
        record(r) &&
        typeof r.id === "string" &&
        record(r.reportedUser) &&
        record(r.reporter),
    )
  );
}
