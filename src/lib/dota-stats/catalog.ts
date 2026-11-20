import "server-only";
import { providerJson } from "./provider-json";
import { OpenDotaError } from "./opendota";
import type { HeroCatalogEntry } from "./types";
export function normalizeCatalog(raw: unknown): HeroCatalogEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new OpenDotaError("INVALID_RESPONSE");
  const entries = Object.values(raw);
  if (!entries.length || entries.length > 300)
    throw new OpenDotaError("INVALID_RESPONSE");
  return entries.map((value) => {
    if (!value || typeof value !== "object")
      throw new OpenDotaError("INVALID_RESPONSE");
    const h = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(h.id) ||
      Number(h.id) <= 0 ||
      typeof h.localized_name !== "string" ||
      h.localized_name.length > 80 ||
      typeof h.img !== "string" ||
      !/^\/apps\/dota2\/images\/dota_react\/heroes\/[a-z0-9_]+\.png\??$/i.test(
        h.img,
      )
    )
      throw new OpenDotaError("INVALID_RESPONSE");
    return {
      heroId: Number(h.id),
      name: h.localized_name,
      image:
        "https://cdn.cloudflare.steamstatic.com" + h.img.replace(/\?$/, ""),
    };
  });
}
export async function fetchHeroCatalog(): Promise<HeroCatalogEntry[]> {
  return normalizeCatalog(
    await providerJson("https://api.opendota.com/api/constants/heroes", {
      signal: AbortSignal.timeout(8000),
    }),
  );
}
