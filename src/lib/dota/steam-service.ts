import "server-only";
import { providerJson } from "../dota-stats/provider-json";
import { OpenDotaError } from "../dota-stats/opendota";
import { recordProviderCache } from "../dota-stats/telemetry";
import type { PrismaClient } from "../../generated/prisma/client";

export type SteamProfile = {
  name: string;
  avatar: string | null;
  profileUrl: string | null;
  visibility: number | null;
};
export const steamAvatarHosts = [
  "avatars.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "steamcdn-a.akamaihd.net",
];
function safeUrl(value: unknown, hosts: readonly string[]) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      hosts.includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// A failed public-profile lookup cannot invalidate an already verified OpenID identity.
async function loadSteamProfile(
  steamId: string,
  fetcher: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  const key = process.env.STEAM_API_KEY?.trim();
  if (!key) return null;
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
  );
  url.searchParams.set("key", key);
  url.searchParams.set("steamids", steamId);
  {
    const json = await providerJson(url.href, {}, fetcher);
    const player = json?.response?.players?.find(
      (item: { steamid?: unknown }) => item.steamid === steamId,
    );
    if (!player || typeof player.personaname !== "string") return null;
    return {
      name: player.personaname.slice(0, 64),
      avatar: safeUrl(player.avatarfull, steamAvatarHosts),
      profileUrl: safeUrl(player.profileurl, ["steamcommunity.com"]),
      visibility: Number.isInteger(player.communityvisibilitystate)
        ? player.communityvisibilitystate
        : null,
    };
  }
}

// Public Steam summaries only. Bounded per process/fetcher; never caches identity or sessions.
const summaries = new WeakMap<
  typeof fetch,
  Map<string, { until: number; value: Promise<SteamProfile | null> }>
>();
export async function getSteamProfile(
  steamId: string,
  fetcher: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  if (!process.env.STEAM_API_KEY?.trim() || !/^\d{17}$/.test(steamId))
    return null;
  let cache = summaries.get(fetcher);
  if (!cache) {
    cache = new Map();
    summaries.set(fetcher, cache);
  }
  const now = Date.now(),
    old = cache.get(steamId);
  if (old && old.until > now) {
    recordProviderCache("STEAM", true);
    return old.value;
  }
  recordProviderCache("STEAM", false);
  for (const [id, entry] of cache) if (entry.until <= now) cache.delete(id);
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  const entry = {
    until: now + 300000,
    value: Promise.resolve(null) as Promise<SteamProfile | null>,
  };
  entry.value = loadSteamProfile(steamId, fetcher).then(
    (value) => {
      entry.until = Date.now() + (value ? 300000 : 60000);
      return value;
    },
    (error) => {
      entry.until =
        Date.now() +
        Math.max(
          60000,
          error instanceof OpenDotaError ? (error.retryAfterMs ?? 0) : 0,
        );
      return null;
    },
  );
  cache.set(steamId, entry);
  return entry.value;
}

// Optional enrichment of an existing identity. Can also be called by a future
// server-side sync job; it never creates users or changes authentication.
export async function syncSteamProfile(
  db: PrismaClient,
  userId: string,
  steamId: string,
) {
  try {
    const steam = await getSteamProfile(steamId);
    if (!steam) return false;
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.steamId !== steamId)
        throw new Error("STEAM_IDENTITY_MISMATCH");
      await tx.dotaAccount.update({
        where: { userId },
        data: {
          steamPersonaName: steam.name,
          steamProfileUrl: steam.profileUrl,
          steamVisibility: steam.visibility,
        },
      });
      // Preserve the player's customized Draftory name and avatar.
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(!user.avatar && steam.avatar ? { avatar: steam.avatar } : {}),
          ...(user.displayName === "Jugador de Steam"
            ? { displayName: steam.name }
            : {}),
        },
      });
    });
    return true;
  } catch {
    return false;
  } // Enrichment/storage outages cannot fail login.
}
