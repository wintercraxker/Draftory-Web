import { validatePreferredRoles } from "../dota-roles";
export const accountCountries = [
  "Colombia",
  "Perú",
  "Argentina",
  "Chile",
  "Brasil",
  "Ecuador",
  "Bolivia",
  "Venezuela",
  "México",
  "Estados Unidos",
  "España",
  "Otro",
];
export const accountRegions = ["Sudamérica", "US East", "Europa"];
export function validateOnboarding(input: unknown) {
  if (!input || typeof input !== "object")
    throw new Error("Completa tu perfil.");
  const value = input as Record<string, unknown>;
  if (
    typeof value.country !== "string" ||
    !accountCountries.includes(value.country)
  )
    throw new Error("Elige un país.");
  if (
    typeof value.region !== "string" ||
    !accountRegions.includes(value.region)
  )
    throw new Error("Elige una región.");
  return {
    country: value.country,
    region: value.region,
    ...validatePreferredRoles(
      value.preferredRolePrimary,
      value.preferredRoleSecondary,
    ),
  };
}
