import Link from "next/link";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import type { ReactNode } from "react";

import type { Player } from "@/lib/competitive";
import { profileHref } from "@/lib/player-profiles";
import {
  AvatarImage,
  useIdentityName,
  useIdentityLevel,
  useIdentityXp,
  useOwnIdentity,
} from "./AvatarIdentity";
import { LevelBadge } from "./LevelBadge";

export function CurrentUserBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`ranking-you current-user-badge ${className}`}>Tú</span>
  );
}

export function PlayerAvatar({
  player,
  size = 32,
  className = "",
}: {
  player: Pick<Player, "id" | "name" | "avatar">;
  size?: number;
  className?: string;
}) {
  return (
    <Link
      href={profileHref(player)}
      prefetch={false}
      aria-label={`Abrir perfil de ${player.name}`}
      className={`player-profile-avatar ${className}`}
    >
      <AvatarImage
        id={player.id}
        src={player.avatar}
        size={size}
        alt={player.name}
        className="rounded-[inherit] object-cover"
      />
    </Link>
  );
}
export function PlayerName({
  player,
  className = "",
  children,
  showLevel = true,
}: {
  player: Pick<Player, "id" | "name"> & {
    level?: number;
    xp?: number;
    xpAvailable?: boolean;
  };
  className?: string;
  children?: ReactNode;
  showLevel?: boolean;
}) {
  const isOwner = useOwnIdentity(player.id);
  const name = useIdentityName(player.id, player.name);
  const level = useIdentityLevel(player.id, player.level);
  const xp = useIdentityXp(
    player.id,
    player.xpAvailable === false ? undefined : player.xp,
  );
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Link
        href={profileHref(player)}
        prefetch={false}
        title={name}
        className={`player-profile-name ${className}`}
      >
        <PlayerDisplayName id={player.id} name={name}>
          {children}
        </PlayerDisplayName>
      </Link>
      {showLevel && (
        <LevelBadge level={level} xp={xp} isOwner={isOwner} playerName={name} />
      )}
    </span>
  );
}
