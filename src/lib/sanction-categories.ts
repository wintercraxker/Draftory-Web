// Only these reviewed phrases can be published on another user's profile.
export const sanctionCategories: Record<string, string> = {
  COMMUNITY_RULES: "Incumplimiento de las normas de la comunidad.",
  INAPPROPRIATE_CONDUCT: "Conducta inapropiada.",
  HARASSMENT: "Acoso o comportamiento abusivo.",
  SPAM: "Spam o uso indebido de los canales.",
  IMPERSONATION: "Suplantación de identidad.",
  OTHER: "Otros.",
};
export function publicSanctionReason(category: unknown) {
  return (
    sanctionCategories[String(category)] ?? sanctionCategories.COMMUNITY_RULES
  );
}
