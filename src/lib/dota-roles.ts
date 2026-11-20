export const dotaRoles = [
  { id: "carry", name: "Hard Carry", image: "/hardcarry.png", legacy: "Carry" },
  { id: "mid", name: "Midlaner", image: "/midlaner.png", legacy: "Mid" },
  {
    id: "offlane",
    name: "Offlaner",
    image: "/offlaner.png",
    legacy: "Offlane",
  },
  {
    id: "support",
    name: "Support",
    image: "/support 4.png",
    legacy: "Support",
  },
  {
    id: "hard_support",
    name: "Hard Support",
    image: "/support5.png",
    legacy: "Hard Support",
  },
] as const;
export type DotaRoleId = (typeof dotaRoles)[number]["id"];
export function validateRole(input: unknown): DotaRoleId {
  if (!dotaRoles.some((role) => role.id === input))
    throw new Error("Elige un rol válido.");
  return input as DotaRoleId;
}
export type RoleSource = {
  preferredRolePrimary?: DotaRoleId | null;
  preferredRoleSecondary?: DotaRoleId | null;
};
export function validatePreferredRoles(primary: unknown, secondary: unknown) {
  const preferredRolePrimary = validateRole(primary);
  const preferredRoleSecondary =
    secondary === null || secondary === undefined || secondary === ""
      ? null
      : validateRole(secondary);
  if (preferredRolePrimary === preferredRoleSecondary)
    throw new Error("El rol secundario debe ser diferente del principal.");
  return { preferredRolePrimary, preferredRoleSecondary };
}
// Compatibility boundary for older demo snapshots. New profiles use the pair.
export function getPreferredRole(player: RoleSource): DotaRoleId | null {
  if (player.preferredRolePrimary !== undefined)
    return player.preferredRolePrimary === null
      ? null
      : validateRole(player.preferredRolePrimary);
  const legacy = player as RoleSource & {
    preferredRole?: DotaRoleId | null;
    preferredRoles?: unknown[];
    position?: string;
  };
  if (legacy.preferredRole !== undefined)
    return legacy.preferredRole === null
      ? null
      : validateRole(legacy.preferredRole);
  const first = legacy.preferredRoles?.[0];
  return (
    dotaRoles.find((role) => role.id === first)?.id ??
    dotaRoles.find(
      (role) =>
        role.name === legacy.position || role.legacy === legacy.position,
    )?.id ??
    null
  );
}
export function getSecondaryRole(player: RoleSource): DotaRoleId | null {
  const role = player.preferredRoleSecondary;
  return role && role !== getPreferredRole(player) ? validateRole(role) : null;
}
export function getRoomRole(
  player: RoleSource & { roomRole?: DotaRoleId | null },
) {
  return player.roomRole === undefined
    ? getPreferredRole(player)
    : player.roomRole === null
      ? null
      : validateRole(player.roomRole);
}
