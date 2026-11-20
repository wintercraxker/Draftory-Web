import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isStratzMatchAnalytics,
  type MatchAnalytics,
} from "../dota-stats/match-analytics";
export const previewMatchId = "9031426459";
export type StratzPreview = {
  matchId: string;
  source: "STRATZ";
  queriedAt: string;
  status: string;
  httpStatus: number | null;
  analytics: MatchAnalytics | null;
};
export function matchPreviewEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DRAFTORY_ENABLE_MATCH_PREVIEW === "true"
  );
}
// A separately authorized CLI populates this cache. Rendering cannot call providers or write Match.
export async function readStratzPreview(): Promise<StratzPreview | null> {
  try {
    const p = path.join(
      process.cwd(),
      ".tmp/stratz-preview",
      previewMatchId + ".json",
    );
    const stat = await fs.lstat(p);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024)
      return null;
    const data = JSON.parse(await fs.readFile(p, "utf8"));
    if (
      data.source !== "STRATZ" ||
      data.matchId !== previewMatchId ||
      typeof data.queriedAt !== "string" ||
      typeof data.status !== "string" ||
      (data.analytics &&
        !isStratzMatchAnalytics(data.analytics, previewMatchId))
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
