"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { useState } from "react";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import { staffAvatar } from "@/lib/staff-avatar";
type Identity = {
  id?: string;
  displayName?: string | null;
  username?: string;
  avatar?: string | null;
  customAvatarUrl?: string | null;
  draftoryIdentity?: { publicId: string } | null;
};
export function StaffIdentity({
  user,
  size = 38,
  detail,
  avatarOnly = false,
}: {
  user?: Identity | null;
  size?: number;
  detail?: string;
  avatarOnly?: boolean;
}) {
  const name = user?.displayName || user?.username || "Cuenta no disponible";
  const src = staffAvatar(user?.avatar) || staffAvatar(user?.customAvatarUrl);
  const [failed, setFailed] = useState<string>();
  return (
    <span className="staff-person">
      <span
        className="staff-person-avatar"
        data-player-name={name}
        data-player-hover={
          user?.id
            ? `id:${user.id}`
            : user?.draftoryIdentity?.publicId
              ? `public:${user.draftoryIdentity.publicId}`
              : undefined
        }
        style={{ width: size, height: size }}
        onErrorCapture={() => setFailed(src)}
      >
        {src && failed !== src ? (
          <AvatarImage
            src={src}
            size={size}
            alt={name}
            className="rounded-full object-cover"
          />
        ) : (
          <span aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      {!avatarOnly && (
        <span className="staff-person-copy">
          <strong>
            <PlayerDisplayName
              id={user?.id ?? user?.draftoryIdentity?.publicId}
              name={name}
            />
          </strong>
          {(detail || user?.draftoryIdentity?.publicId) && (
            <small>{detail || user?.draftoryIdentity?.publicId}</small>
          )}
        </span>
      )}
    </span>
  );
}
