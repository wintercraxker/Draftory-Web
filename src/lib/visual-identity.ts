import type { SessionIdentity } from "./auth/types";
export type VisualIdentity = {
  id: string;
  name: string;
  avatar: string | null;
};
export function applyVisualIdentity(
  old: SessionIdentity | null,
  value: VisualIdentity,
): SessionIdentity | null {
  if (!old || old.id !== value.id) return old;
  return {
    ...old,
    name: value.name,
    avatar: value.avatar,
    player: old.player
      ? { ...old.player, name: value.name, avatar: value.avatar ?? undefined }
      : null,
  };
}
