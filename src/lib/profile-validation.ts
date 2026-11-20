// Shared with Settings and onboarding. Preserve the existing raw-length/character policy.
export function validateDisplayName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 64 ||
    /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error("Nombre: revisa el texto y su longitud máxima (64).");
  return value.trim();
}
