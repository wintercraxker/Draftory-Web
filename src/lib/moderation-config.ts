// Review guidance, never a timer or automatic punishment policy.
export const RECONNECT_GRACE_MINUTES: number | null = null;
export const reportCategories = [
  "abandono",
  "conducta",
  "abuso",
  "otro",
  "acoso",
  "spam",
  "suplantacion",
] as const;
export const reportCategoryInfo: Record<
  (typeof reportCategories)[number],
  { label: string; description: string }
> = {
  abandono: {
    label: "Abandono",
    description: "Abandonar partidas o incumplir compromisos de juego.",
  },
  conducta: {
    label: "Conducta",
    description: "Comportamiento inapropiado durante la interacción.",
  },
  abuso: {
    label: "Abuso",
    description: "Uso indebido de funcionalidades o comportamientos abusivos.",
  },
  otro: {
    label: "Otro",
    description: "Situaciones que no encajan en las categorías anteriores.",
  },
  acoso: {
    label: "Acoso",
    description: "Hostigamiento reiterado hacia otros usuarios.",
  },
  spam: {
    label: "Spam",
    description: "Mensajes repetitivos o publicidad no deseada.",
  },
  suplantacion: {
    label: "Suplantación",
    description: "Hacerse pasar por otra persona.",
  },
};
export const moderationLimits = {
  subject: 120,
  description: 2000,
  publicReason: 500,
  internalNote: 2000,
  reportsPerHour: 5,
  duplicateMinutes: 10,
};
export const sanctionHours = [1, 3, 6, 12, 24, 72, 168] as const;
