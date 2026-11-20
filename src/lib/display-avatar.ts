// Steam avatar stays in User.avatar. Custom storage uses an independent pointer.
export function resolveDisplayAvatar(user: {
  avatar?: string | null;
  customAvatarUrl?: string | null;
}): string | null {
  return user.customAvatarUrl || user.avatar || null;
}
