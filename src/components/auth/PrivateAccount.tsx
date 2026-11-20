import type { PrivateProfile } from "@/lib/real/types";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import { LevelBadge } from "../dashboard/LevelBadge";
import { PublicIdentity } from "../dashboard/PublicIdentity";
import { ProfileReportAction } from "../dashboard/ProfileReportAction";
import { ProfileRecognition } from "../moderation/ProfileRecognition";
export function PrivateAccount({ profile }: { profile: PrivateProfile }) {
  return (
    <section className="dashboard-panel rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <AvatarImage
            id={profile.id}
            src={profile.avatar ?? undefined}
            alt={profile.name}
            size={80}
            className="size-20 rounded-2xl object-cover"
          />
          <div>
            <h1 className="break-words text-2xl font-semibold">
              {profile.name} <ProfileRecognition userId={profile.id} />
              <LevelBadge
                level={profile.level}
                isOwner={false}
                playerName={profile.name}
              />
            </h1>
            <PublicIdentity publicId={profile.publicId} />
          </div>
        </div>
        <ProfileReportAction publicId={profile.publicId} />
      </div>
      <h2 className="mt-8 text-sm font-semibold">Perfil privado</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Este jugador ha limitado la información visible de su perfil.
      </p>
    </section>
  );
}
