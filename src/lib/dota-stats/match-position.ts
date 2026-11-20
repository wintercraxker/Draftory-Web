import { dotaRoles, type DotaRoleId } from "../dota-roles";
const roles: DotaRoleId[] = [
  "carry",
  "mid",
  "offlane",
  "support",
  "hard_support",
];
const labels = ["Carry", "Mid", "Offlane", "Support", "Hard Support"];
export type PlayedPosition = ReturnType<typeof matchPosition>;
export function matchPosition(input: {
  verifiedMode?: string;
  position?: string | null;
  provider?: string | null;
  assignedRole?: DotaRoleId | null;
}) {
  const solo = ["ONE_V_ONE_MID", "SOLO_MID"].includes(input.verifiedMode ?? "");
  const published = /^POSITION_[1-5]$/.test(input.position ?? "");
  const assigned = roles.indexOf(input.assignedRole as DotaRoleId);
  const index = solo
    ? 1
    : published
      ? Number(input.position!.slice(-1)) - 1
      : assigned;
  if (index < 0) return null;
  return {
    position: `POSITION_${index + 1}`,
    role: roles[index],
    image: dotaRoles.find((r) => r.id === roles[index])!.image,
    label: `${labels[index]} · Pos. ${index + 1}`,
    source: solo
      ? "Regla del modo Solo Mid 1v1 verificado; no modifica tus preferencias."
      : published
        ? `Posición informada por ${input.provider ?? "el proveedor"}; puede ser una clasificación del proveedor y no confirma el carril observado.`
        : "Posición asignada en Draftory; no confirma el carril realmente jugado.",
    kind: solo ? "MODE" : published ? "PROVIDER" : "ASSIGNED",
  };
}
