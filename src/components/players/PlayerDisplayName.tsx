"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth/AuthProvider";
import type { ClanSummary } from "@/lib/clans";
const IdentityContext = createContext<Record<string, ClanSummary>>({});
export function ClanIdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(),
    viewer = user?.id,
    path = usePathname(),
    disabled = path.startsWith("/demo") || path.startsWith("/dev/");
  const [state, setState] = useState<{
    viewer: string;
    names: Record<string, ClanSummary>;
  }>({ viewer: "", names: {} });

  useEffect(() => {
    if (!viewer || disabled) return;
    const setNames = (names: Record<string, ClanSummary>) =>
      setState({ viewer, names });
    let alive = true,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      generation = 0;
    const cache = new Map<string, { value: ClanSummary | null; at: number }>();
    const controller = new AbortController();
    const scan = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 120);
    };
    async function load() {
      if (busy || !alive || document.visibilityState !== "visible") return;
      const nodes = [
        ...document.querySelectorAll<HTMLElement>("[data-player-name-id]"),
      ].filter((n) => {
        const r = n.getBoundingClientRect();
        return (
          r.width > 0 && r.height > 0 && r.bottom >= 0 && r.top <= innerHeight
        );
      });
      const ids = [
        ...new Set(
          nodes
            .map((n) => n.dataset.playerNameId!)
            .filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)),
        ),
      ].slice(0, 100);
      const needed = ids
        .filter(
          (id) => !cache.has(id) || Date.now() - cache.get(id)!.at > 60000,
        )
        .slice(0, 100);
      if (!needed.length) return;
      const token = generation;
      busy = true;
      try {
        const r = await fetch(
          "/api/clans/identities?ids=" + encodeURIComponent(needed.join(",")),
          { cache: "no-store", signal: controller.signal },
        );
        if (!r.ok) return;
        const body = (await r.json()) as {
          identities: Record<string, ClanSummary>;
        };
        if (!alive || token !== generation) return;
        for (const id of needed)
          cache.set(id, { value: body.identities[id] ?? null, at: Date.now() });
        while (cache.size > 500) cache.delete(cache.keys().next().value!);
        setNames(
          Object.fromEntries(
            [...cache].flatMap(([id, r]) => (r.value ? [[id, r.value]] : [])),
          ),
        );
        if (ids.some((id) => !cache.has(id))) scan();
      } catch {
      } finally {
        busy = false;
        if (token !== generation && alive) scan();
      }
    }
    const invalidate = () => {
      generation++;
      cache.clear();
      setNames({});
      scan();
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    window.addEventListener("draftory:clans-updated", invalidate);
    window.addEventListener("focus", scan);
    window.addEventListener("scroll", scan, true);
    window.addEventListener("resize", scan);
    document.addEventListener("visibilitychange", scan);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("draftory:clans-updated", invalidate);
      window.removeEventListener("focus", scan);
      window.removeEventListener("scroll", scan, true);
      window.removeEventListener("resize", scan);
      document.removeEventListener("visibilitychange", scan);
    };
  }, [viewer, disabled]);
  // Never reuse another viewer's cached private identity after a session change.
  return (
    <IdentityContext.Provider
      key={user?.id ?? "guest"}
      value={!disabled && viewer === state.viewer ? state.names : {}}
    >
      {children}
    </IdentityContext.Provider>
  );
}
export function PlayerDisplayName({
  id,
  name,
  tag,
  children,
  private: privateProfile = false,
}: {
  id?: string;
  name: string;
  tag?: string | null;
  children?: ReactNode;
  private?: boolean;
}) {
  const identities = useContext(IdentityContext),
    clan = id ? identities[id] : null;
  const prefix = privateProfile ? null : (tag ?? clan?.tag);
  return (
    <span data-player-name-id={privateProfile || tag ? undefined : id}>
      {prefix && (
        <span style={{ color: "#a1a1aa", fontWeight: 500 }}>{prefix}.</span>
      )}
      {privateProfile ? "Jugador privado" : (children ?? name)}
    </span>
  );
}
