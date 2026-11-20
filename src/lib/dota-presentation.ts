import type { DotaHero, HeroCatalogEntry } from "./dota-stats/types";

export function immortalBadge(
  rankTier: number | null | undefined,
  leaderboardRank: number | null | undefined,
) {
  if (rankTier !== 80) return null;
  const rank =
    Number.isSafeInteger(leaderboardRank) && Number(leaderboardRank) > 0
      ? Number(leaderboardRank)
      : null;
  // Verified against OpenDota RankTierMedal. Top 1 shares Top 10 artwork.
  return {
    rank,
    variant:
      rank === 1
        ? "top1"
        : rank && rank <= 10
          ? "top10"
          : rank && rank <= 100
            ? "top100"
            : rank
              ? "ranked"
              : "immortal",
    image:
      rank && rank <= 10
        ? "/m_inmortal10.png"
        : rank && rank <= 100
          ? "/dota-medals/immortal-top100.png"
          : "/m_inmortal.webp",
    label: rank ? `Inmortal, puesto ${rank}` : "Inmortal",
  };
}

export function selectMainHero(heroes: DotaHero[], snapshotAt?: string | null) {
  const valid = heroes.filter(
    (h) =>
      Number.isSafeInteger(h.heroId) &&
      Number.isSafeInteger(h.games) &&
      h.games > 0 &&
      Number.isSafeInteger(h.wins) &&
      h.wins >= 0 &&
      h.wins <= h.games,
  );
  if (!valid.length) return null;
  void snapshotAt; // Selection never changes with wall clock or viewing account.
  const played = (h: DotaHero) => {
    const at = h.lastPlayed ? Date.parse(h.lastPlayed) : NaN;
    return Number.isFinite(at) ? at : 0;
  };
  return {
    hero: [...valid].sort(
      (a, b) =>
        b.games - a.games ||
        b.wins - a.wins ||
        b.wins / b.games - a.wins / a.games ||
        played(b) - played(a) ||
        a.heroId - b.heroId,
    )[0],
    reason: "most-played",
  };
}

export type HeroVisualAssets = {
  artwork?: string;
  model?: { url: string; format: "glb"; bytes: number; licensed: boolean };
};
export function heroVisual(
  catalog: HeroCatalogEntry | undefined,
  assets?: HeroVisualAssets,
) {
  // No model has verified web/redistribution support in this phase. Never load one.
  return catalog
    ? {
        artwork:
          assets?.artwork?.startsWith("/") && !assets.artwork.startsWith("//")
            ? assets.artwork
            : undefined,
        portrait: catalog.image,
        name: catalog.name,
      }
    : null;
}

export function getHeroInternalName(
  heroId: number,
  catalog: HeroCatalogEntry[],
) {
  if (!Number.isSafeInteger(heroId) || heroId <= 0) return null;
  const entry = catalog.find((h) => h.heroId === heroId);
  // The existing normalized portrait retains Valve's canonical internal name.
  return (
    entry?.image.match(
      /^https:\/\/cdn\.cloudflare\.steamstatic\.com\/apps\/dota2\/images\/dota_react\/heroes\/([a-z0-9_]+)\.png$/,
    )?.[1] ?? null
  );
}
export function getHeroRenderUrl(heroId: number, catalog: HeroCatalogEntry[]) {
  const name = getHeroInternalName(heroId, catalog);
  return name
    ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${name}.webm`
    : null;
}
export function shouldAnimateHero(
  reducedMotion: boolean,
  width: number,
  webmSupported: boolean,
) {
  return !reducedMotion && width >= 1280 && webmSupported;
}
