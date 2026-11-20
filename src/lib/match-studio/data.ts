import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { providerJson } from "../dota-stats/provider-json";
import { studioQuery, studioTalentQuery } from "./query";
import { normalizeStudio, simulatedStudio, type StudioMatch } from "./model";
import type { HeroCatalogEntry } from "../dota-stats/types";
import { isStratzMatchAnalytics } from "../dota-stats/match-analytics";
const folder = path.join(process.cwd(), ".tmp/match-studio");
const pending = new Map<string, Promise<StudioMatch>>();
const failures = new Map<string, { until: number; code: string }>();
const talentPending = new Map<number, Promise<Record<string, string>>>();
let requests: number[] = [];
export function studioEnabled() {
  return process.env.NODE_ENV !== "production";
}
async function talentNames(
  raw: unknown,
  token: string,
): Promise<Record<string, string>> {
  const version = (raw as { data?: { match?: { gameVersionId?: number } } })
    ?.data?.match?.gameVersionId;
  if (
    !version ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > 32767
  )
    return {};
  const file = path.join(folder, `talents-${version}-names.json`);
  try {
    const stat = await fs.lstat(file);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 2e6) {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.entries(value).every(
          ([k, v]) => /^\d+$/.test(k) && typeof v === "string",
        )
      )
        return value;
    }
  } catch {}
  if (talentPending.has(version)) return talentPending.get(version)!;
  const task = (async () => {
    try {
      requests = requests.filter((t) => Date.now() - t < 60000);
      if (requests.length >= 4) return {};
      requests.push(Date.now());
      const result = (await providerJson(
        "https://api.stratz.com/graphql",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "STRATZ_API",
          },
          body: JSON.stringify({
            query: studioTalentQuery,
            variables: { version },
          }),
        },
        fetch,
        2e6,
      )) as {
        errors?: unknown;
        data?: {
          constants?: {
            abilities?: { id: number; language?: { displayName?: string } }[];
          };
        };
      };
      if (result.errors || !Array.isArray(result.data?.constants?.abilities))
        return {};
      const names = Object.fromEntries(
        result.data.constants.abilities
          .filter(
            (a) =>
              Number.isSafeInteger(a.id) &&
              typeof a.language?.displayName === "string",
          )
          .map((a) => [String(a.id), a.language!.displayName!.slice(0, 120)]),
      );
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(file + ".new", JSON.stringify(names));
      await fs.rename(file + ".new", file);
      return names;
    } catch {
      return {};
    }
  })().finally(() => talentPending.delete(version));
  talentPending.set(version, task);
  return task;
}
async function cached(id: string): Promise<StudioMatch | null> {
  try {
    const file = path.join(folder, id + ".json"),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2e6) return null;
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return data.id === id &&
      !data.simulated &&
      Array.isArray(data.players) &&
      data.players.length <= 10 &&
      isStratzMatchAnalytics(data.analytics, id) &&
      Array.isArray(data.timeline) &&
      data.timeline.length < 10000
      ? data
      : null;
  } catch {
    return null;
  }
}
export async function readStudio(id: string): Promise<StudioMatch> {
  if (!studioEnabled() || !/^[1-9]\d{0,14}$/.test(id))
    throw Error("STUDIO_DISABLED_OR_INVALID_ID");
  const old = await cached(id);
  if (old && Date.now() - Date.parse(old.queriedAt) < 15 * 60000) return old;
  const previous = failures.get(id);
  if (previous && previous.until > Date.now())
    return old
      ? { ...old, status: "STALE" }
      : { ...simulatedStudio(id), status: previous.code };
  if (pending.has(id)) return pending.get(id)!;
  const task = (async () => {
    let code = "NOT_CONFIGURED";
    try {
      const token = process.env.STRATZ_TOKEN?.trim();
      if (!token) throw Error(code);
      requests = requests.filter((t) => Date.now() - t < 60000);
      if (requests.length >= 4) throw Error("RATE_LIMITED");
      requests.push(Date.now());
      const raw = await providerJson(
        "https://api.stratz.com/graphql",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "STRATZ_API",
          },
          body: JSON.stringify({
            query: studioQuery,
            variables: { id: Number(id) },
          }),
        },
        fetch,
        2e6,
      );
      const data = normalizeStudio(raw, id, await talentNames(raw, token));
      failures.delete(id);
      await fs.mkdir(folder, { recursive: true });
      const file = path.join(folder, id + ".json");
      await fs.writeFile(file + ".new", JSON.stringify(data));
      await fs.rename(file + ".new", file);
      return data;
    } catch (e) {
      code =
        e instanceof Error &&
        [
          "NOT_CONFIGURED",
          "RATE_LIMITED",
          "NOT_FOUND",
          "INVALID_RESPONSE",
          "API_ERROR",
        ].includes(e.message)
          ? e.message
          : "PROVIDER_UNAVAILABLE";
      const retry =
        e &&
        typeof e === "object" &&
        "retryAfterMs" in e &&
        typeof e.retryAfterMs === "number"
          ? e.retryAfterMs
          : 5 * 60000;
      failures.set(id, {
        until: Date.now() + Math.max(60000, Math.min(retry, 86400000)),
        code,
      });
    }
    if (old)
      return {
        ...old,
        status: "STALE",
        warnings: [
          ...old.warnings,
          "El proveedor no respondió. Mostramos el último snapshot disponible.",
        ],
      };
    return { ...simulatedStudio(id), status: code };
  })().finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}
export async function studioCatalog(): Promise<HeroCatalogEntry[]> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(folder, "catalog.json"), "utf8"),
    );
  } catch {
    return [];
  }
}
