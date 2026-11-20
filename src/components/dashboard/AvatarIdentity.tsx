"use client";
import { createContext, useContext, type ReactNode } from "react";
import Image from "next/image";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import type { DotaRoleId } from "@/lib/dota-roles";

const AvatarContext = createContext<{
  id: string;
  name?: string;
  level?: number;
  xp?: number | string;
  avatar?: string;
  preferredRolePrimary?: DotaRoleId | null;
  preferredRoleSecondary?: DotaRoleId | null;
} | null>(null);
export function AvatarIdentityProvider({
  id,
  name,
  level,
  xp,
  avatar,
  preferredRolePrimary,
  preferredRoleSecondary,
  children,
}: {
  id: string;
  name?: string;
  level?: number;
  xp?: number | string;
  avatar?: string;
  preferredRolePrimary?: DotaRoleId | null;
  preferredRoleSecondary?: DotaRoleId | null;
  children: ReactNode;
}) {
  return (
    <AvatarContext.Provider
      value={{
        id,
        name,
        level,
        xp,
        avatar,
        preferredRolePrimary,
        preferredRoleSecondary,
      }}
    >
      {children}
    </AvatarContext.Provider>
  );
}
export function useIdentityLevel(id: string | undefined, fallback?: number) {
  const identity = useContext(AvatarContext);
  return id === identity?.id ? (identity?.level ?? fallback) : fallback;
}
export function useIdentityXp(
  id: string | undefined,
  fallback?: number | string,
) {
  const identity = useContext(AvatarContext);
  return id === identity?.id ? (identity?.xp ?? fallback) : fallback;
}
export function useIdentityName(id: string | undefined, fallback: string) {
  const identity = useContext(AvatarContext);
  return id === identity?.id ? (identity?.name ?? fallback) : fallback;
}
export function IdentityName({ id, name }: { id?: string; name: string }) {
  return <PlayerDisplayName id={id} name={useIdentityName(id, name)} />;
}
export function useIdentityRole(
  id: string | undefined,
  fallback: DotaRoleId | null,
) {
  const identity = useContext(AvatarContext);
  return id === identity?.id && identity?.preferredRolePrimary !== undefined
    ? identity.preferredRolePrimary
    : fallback;
}
export function useIdentitySecondaryRole(
  id: string | undefined,
  fallback: DotaRoleId | null,
) {
  const identity = useContext(AvatarContext);
  return id === identity?.id && identity?.preferredRoleSecondary !== undefined
    ? identity.preferredRoleSecondary
    : fallback;
}
export function useIdentityAvatar(id?: string, fallback?: string) {
  const identity = useContext(AvatarContext);
  return id && identity?.id === id ? identity.avatar : fallback;
}
export function AvatarImage({
  id,
  src,
  size = 32,
  className = "",
  alt = "",
  responsive = false,
  hoverReference,
  hoverable = true,
}: {
  id?: string;
  src?: string;
  size?: number;
  className?: string;
  alt?: string;
  responsive?: boolean;
  hoverReference?: string;
  hoverable?: boolean;
}) {
  const avatar = useIdentityAvatar(id, src);
  const reference = hoverable
    ? (hoverReference ?? (id ? `id:${id}` : undefined))
    : undefined;
  return avatar ? (
    <Image
      data-player-hover={reference}
      data-player-name={reference ? alt || undefined : undefined}
      src={avatar}
      width={size}
      height={size}
      alt={alt}
      unoptimized={
        avatar.startsWith("data:") ||
        avatar.startsWith("/api/clans/") ||
        avatar.startsWith("/api/profile/avatar/") ||
        avatar.startsWith("/api/public/team/avatar/")
      }
      className={className}
    />
  ) : (
    <span
      data-player-hover={reference}
      data-player-name={reference ? alt || undefined : undefined}
      className={`grid place-items-center bg-zinc-800 ${className}`}
      style={responsive ? undefined : { width: size, height: size }}
    >
      {alt[0] ?? "?"}
    </span>
  );
}

export function useOwnIdentity(id?: string) {
  return id === useContext(AvatarContext)?.id;
}
