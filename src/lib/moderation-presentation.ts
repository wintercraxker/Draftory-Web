export const staffBadgeLabels: Record<string, string> = {
  OWNER: "Propietario de Draftory",
  ADMIN: "Administrador de Draftory",
  MODERATOR: "Moderador de Draftory",
  HELPER: "Ayudante de Draftory",
};
export function remainingSanction(endsAt: string, now: number) {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return null;
  if (ms < 60000) return "Menos de un minuto";
  const minutes = Math.floor(ms / 60000),
    days = Math.floor(minutes / 1440),
    hours = Math.floor(minutes / 60) % 24;
  return days
    ? `${days} ${days === 1 ? "día" : "días"} y ${hours} ${hours === 1 ? "hora" : "horas"}`
    : hours
      ? `${hours} ${hours === 1 ? "hora" : "horas"} y ${minutes % 60} min`
      : `${minutes} min`;
}
export const staffPermissionLabels: Record<string, string> = {
  "users.view": "Ver usuarios",
  "users.search": "Buscar usuarios",
  "reports.view": "Ver reportes",
  "reports.resolve": "Asignar y resolver reportes",
  "history.view": "Ver historial de moderación",
  "users.warn": "Advertir usuarios",
  "users.mute": "Silenciar temporalmente",
  "users.suspend": "Suspender temporalmente",
  "users.ban": "Suspender permanentemente",
  "users.revoke": "Revocar sanciones",
  "messages.moderate": "Moderar mensajes",
  "rooms.moderate": "Moderar salas",
  "rooms.kick": "Retirar usuarios de salas",
  "staff.manage": "Gestionar miembros del staff",
  "staff.assign": "Asignar roles inferiores",
  "permissions.configure": "Configurar permisos (reservado a OWNER)",
  "audit.view": "Consultar auditoría",
  "medals.verify": "Revisar medallas declaradas",
  "mmr.verify": "Aprobar, corregir y revocar MMR",
};

export const sanctionKindLabels: Record<string, string> = {
  WARNING: "Advertencia",
  MUTE: "Silencio temporal",
  SUSPENSION: "Suspensión temporal",
  PERMANENT: "Suspensión permanente",
};
