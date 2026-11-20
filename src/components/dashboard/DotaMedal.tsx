import Image from "next/image";
import { immortalBadge } from "@/lib/dota-presentation";
export function DotaMedal({
  rankTier,
  leaderboardRank,
  image,
  name,
}: {
  rankTier?: number | null;
  leaderboardRank?: number | null;
  image?: string;
  name: string;
}) {
  const badge = immortalBadge(rankTier, leaderboardRank),
    src = badge?.image ?? image;
  if (!src) return null;
  return (
    <span
      className="dota-medal"
      role="img"
      aria-label={badge?.label ?? name}
      title={badge?.label ?? name}
      data-variant={badge?.variant}
    >
      <Image
        src={src}
        alt=""
        width={96}
        height={96}
        className="size-full object-contain"
      />
      {badge?.rank && (
        <span
          aria-hidden="true"
          className="dota-medal-place"
          data-digits={String(badge.rank).length}
        >
          {badge.rank}
        </span>
      )}
    </span>
  );
}
