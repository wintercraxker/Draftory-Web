"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Award, ArrowUpRight, X } from "lucide-react";
import { LevelBadge } from "../dashboard/LevelBadge";
import { StaffRoleBadge, SponsorBadge } from "../moderation/ProfileRecognition";
import { achievementIcons } from "../dashboard/Achievements";
import { SocialLink } from "../dashboard/ProfileSocials";
import { useAuth } from "../auth/AuthProvider";
import { ClanIdentityProvider, PlayerDisplayName } from "./PlayerDisplayName";
import { DotaMedal } from "../dashboard/DotaMedal";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import { PlayerHoverCache, HoverHttpError } from "@/lib/player-hover-cache";
import { hoverPosition, type PlayerHoverProfile } from "@/lib/player-hover";
import s from "./PlayerHoverCard.module.css";
const cache = new PlayerHoverCache();
let cacheViewer: string | undefined;
type View = {
  anchor: HTMLElement;
  reference: string;
  data?: PlayerHoverProfile;
  error?: string;
  status?: number;
};
export function PlayerHoverProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const path = usePathname();
  return (
    <ClanIdentityProvider>
      <span id="draftory-mini-profile-help" className="sr-only">
        Mantén pulsado o usa Alt + flecha abajo para abrir el mini perfil.
      </span>
      {children}
      <Controller
        key={(user?.id ?? "guest") + path}
        viewer={user?.id ?? ""}
        disabled={path.startsWith("/demo") || path.startsWith("/dev/")}
      />
    </ClanIdentityProvider>
  );
}
function Controller({
  viewer,
  disabled,
}: {
  viewer: string;
  disabled: boolean;
}) {
  const [view, setView] = useState<View | null>(null),
    panel = useRef<HTMLDivElement>(null);
  const controls = useRef<{
    close: (restore?: boolean) => void;
    retry: () => void;
  } | null>(null);
  useEffect(() => {
    if (cacheViewer !== viewer) {
      cache.clear();
      cacheViewer = viewer;
    }
    if (disabled) return;
    let current: View | null = null,
      generation = 0,
      openTimer: ReturnType<typeof setTimeout> | undefined,
      closeTimer: ReturnType<typeof setTimeout> | undefined,
      holdTimer: ReturnType<typeof setTimeout> | undefined;
    let scheduledAnchor: HTMLElement | null = null,
      keyboardInput = true,
      touchOpen = false;
    let touch: HTMLElement | null = null,
      directTouch = false,
      consumeClick = false,
      touchX = 0,
      touchY = 0,
      suppressFocus = 0;
    const cancelClose = () => {
      clearTimeout(closeTimer);
    };
    const focusTarget = (node: HTMLElement) =>
      node.closest<HTMLElement>("a[href],button,[tabindex]") ?? node;
    function close(restore = false) {
      touchOpen = false;
      scheduledAnchor = null;
      clearTimeout(openTimer);
      clearTimeout(holdTimer);
      cancelClose();
      generation++;
      const old = current;
      current = null;
      setView(null);
      if (restore && old?.anchor.isConnected) {
        suppressFocus = performance.now() + 300;
        focusTarget(old.anchor).focus({ preventScroll: true });
      }
    }
    async function show(anchor: HTMLElement, force = false, fromTouch = false) {
      scheduledAnchor = null;
      clearTimeout(openTimer);
      cancelClose();
      const raw = anchor.dataset.playerHover!;
      const reference = raw === "id:self" && viewer ? "id:" + viewer : raw;
      if (current?.anchor === anchor && !force) return;
      if (!force) touchOpen = fromTouch;
      const token = ++generation;
      current = { anchor, reference };
      setView(current);
      if (reference === "unavailable") {
        current = {
          anchor,
          reference,
          error: "Perfil no disponible.",
          status: 404,
        };
        setView(current);
        return;
      }
      if (!viewer) {
        current = {
          anchor,
          reference,
          error: "Inicia sesión para ver mini perfiles.",
          status: 401,
        };
        setView(current);
        return;
      }
      try {
        const data = await cache.get(viewer, reference);
        if (token === generation && anchor.isConnected) {
          current = { anchor, reference, data };
          setView(current);
        }
      } catch (e) {
        if (token === generation && anchor.isConnected) {
          current = {
            anchor,
            reference,
            error:
              e instanceof HoverHttpError
                ? e.message
                : "No se pudo cargar el perfil. Inténtalo nuevamente.",
            status: e instanceof HoverHttpError ? e.status : 503,
          };
          setView(current);
        }
      }
    }
    function schedule(anchor: HTMLElement) {
      cancelClose();
      if (current?.anchor === anchor || scheduledAnchor === anchor) return;
      clearTimeout(openTimer);
      if (current) close();
      scheduledAnchor = anchor;
      openTimer = setTimeout(() => void show(anchor), 250);
    }
    function leave() {
      scheduledAnchor = null;
      clearTimeout(openTimer);
      cancelClose();
      if (touchOpen) return;
      closeTimer = setTimeout(() => {
        if (
          panel.current?.contains(document.activeElement) ||
          current?.anchor === document.activeElement ||
          focusTarget(current?.anchor ?? document.body) ===
            document.activeElement
        )
          return;
        close();
      }, 200);
    }
    function candidate(
      target: EventTarget | null,
      includeControl = false,
    ): HTMLElement | null {
      if (!(target instanceof Element) || panel.current?.contains(target))
        return null;
      return (
        target.closest<HTMLElement>("[data-player-hover]") ??
        (includeControl
          ? target
              .closest("a,button")
              ?.querySelector<HTMLElement>("[data-player-hover]")
          : null) ??
        null
      );
    }
    // Layout changes (for example modal entrance animations) may emit
    // pointerover under a stationary cursor. Only real pointer movement
    // starts a hover; entering the existing card just cancels dismissal.
    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      if (
        panel.current?.contains(e.target as Node) ||
        candidate(e.target) === current?.anchor
      )
        cancelClose();
    }
    function out(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const to = e.relatedTarget as Node | null;
      if (to && (panel.current?.contains(to) || current?.anchor.contains(to)))
        return;
      if (candidate(e.target) || panel.current?.contains(e.target as Node))
        leave();
    }
    function focus(e: FocusEvent) {
      if (!keyboardInput || performance.now() < suppressFocus) return;
      if (panel.current?.contains(e.target as Node)) {
        cancelClose();
        return;
      }
      const node = candidate(e.target, true);
      const action = node?.closest('button,a[href],summary,[role="button"]');
      const direct =
        action === node ||
        !action ||
        (action instanceof HTMLAnchorElement &&
          /^\/(profile|perfil)(\/|$)/.test(action.pathname));
      // Menus and roster buttons retain their primary keyboard action. Alt+Down
      // opens their informational card without competing with that action.
      if (node && direct) schedule(node);
      else if (current) leave();
    }
    function pointerDown(e: PointerEvent) {
      keyboardInput = false;
      if (panel.current?.contains(e.target as Node)) return;
      const node = candidate(e.target);
      if (!node) {
        close();
        return;
      }
      if (e.pointerType !== "touch") {
        const action = node.closest('button,a[href],summary,[role="button"]');
        if (action && action !== node) close();
        return;
      }
      touch = node;
      touchX = e.clientX;
      touchY = e.clientY;
      consumeClick = false;
      directTouch = false;
      const action = node.closest('button,a[href],summary,[role="button"]');
      const profileLink =
        action instanceof HTMLAnchorElement &&
        /^\/(profile|perfil)(\/|$)/.test(action.pathname);
      if (!action || action === node || profileLink) {
        consumeClick = true;
        directTouch = true;
      } else
        holdTimer = setTimeout(() => {
          consumeClick = true;
          void show(node, false, true);
        }, 450);
    }
    function move(e: PointerEvent) {
      if (e.pointerType !== "touch") {
        const anchor = candidate(e.target);
        if (anchor) schedule(anchor);
      }
      if (touch && Math.hypot(e.clientX - touchX, e.clientY - touchY) > 12) {
        clearTimeout(holdTimer);
        touch = null;
        directTouch = false;
        consumeClick = false;
      }
    }
    function up() {
      clearTimeout(holdTimer);
      if (touch && directTouch) void show(touch, false, true);
      directTouch = false;
    }
    function cancelTouch() {
      clearTimeout(holdTimer);
      touch = null;
      directTouch = false;
      consumeClick = false;
    }
    function contextMenu(e: MouseEvent) {
      if (touch && consumeClick && candidate(e.target) === touch)
        e.preventDefault();
    }
    function click(e: MouseEvent) {
      if (
        consumeClick &&
        touch &&
        (touch.contains(e.target as Node) || candidate(e.target) === touch)
      ) {
        e.preventDefault();
        e.stopPropagation();
        consumeClick = false;
        touch = null;
      }
    }
    function key(e: KeyboardEvent) {
      keyboardInput = true;
      touchOpen = false;
      const node = candidate(e.target, true);
      if (e.key === "Escape" && current) {
        if (panel.current?.querySelector(".level-badge-popover")) return;
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      }
      if (
        node &&
        ((e.key === "ArrowDown" && e.altKey) ||
          ((e.key === "Enter" || e.key === " ") &&
            node === e.target &&
            node.getAttribute("role") === "button"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        void show(node);
        return;
      }
      if (e.key !== "Tab" || !current || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href]",
        ),
      ];
      if (node && !e.shiftKey) {
        e.preventDefault();
        items[0]?.focus();
        return;
      }
      if (items[0] === e.target && e.shiftKey) {
        e.preventDefault();
        close(true);
        return;
      }
      if (items.at(-1) === e.target && !e.shiftKey) {
        const origin = focusTarget(current.anchor),
          all = [
            ...document.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled),[tabindex="0"]',
            ),
          ].filter(
            (el) =>
              !panel.current?.contains(el) && el.getClientRects().length > 0,
          );
        const next = all[all.indexOf(origin) + 1];
        close();
        if (next) {
          e.preventDefault();
          next.focus({ preventScroll: true });
        }
      }
    }
    function prepare(root: ParentNode) {
      for (const el of root.querySelectorAll<HTMLElement>(
        "[data-player-hover]",
      )) {
        const action = el.closest('a[href],button,summary,[role="button"]');
        if (!action) {
          el.tabIndex = 0;
          el.setAttribute("role", "button");
          el.setAttribute(
            "aria-label",
            el.dataset.playerName
              ? `Ver mini perfil de ${el.dataset.playerName}`
              : "Ver mini perfil",
          );
          el.setAttribute("aria-haspopup", "dialog");
        } else {
          action.setAttribute("aria-keyshortcuts", "Alt+ArrowDown");
          if (el.title.startsWith("Mini perfil:")) el.removeAttribute("title");
          action.setAttribute(
            "aria-describedby",
            [
              ...new Set([
                ...(action
                  .getAttribute("aria-describedby")
                  ?.split(/\s+/)
                  .filter(Boolean) ?? []),
                "draftory-mini-profile-help",
              ]),
            ].join(" "),
          );
        }
      }
    }
    prepare(document);
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element) {
            if (node.matches("[data-player-hover]"))
              prepare(node.parentElement ?? document);
            else prepare(node);
          }
      if (current && !current.anchor.isConnected) close();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const invalidate = () => {
      cache.clear();
      if (current) void show(current.anchor, true);
    };
    const scroll = () => {
      if (!current) return;
      const rect = current.anchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) close();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", leave);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancelTouch);
    document.addEventListener("contextmenu", contextMenu, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("draftory:identity-updated", invalidate);
    window.addEventListener("draftory:results-updated", invalidate);
    window.addEventListener("draftory:profile-updated", invalidate);
    window.addEventListener("draftory:clans-updated", invalidate);
    controls.current = {
      close,
      retry: () => {
        if (current) {
          cache.clear();
          void show(current.anchor, true);
        }
      },
    };
    return () => {
      generation++;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      clearTimeout(holdTimer);
      observer.disconnect();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancelTouch);
      document.removeEventListener("contextmenu", contextMenu, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("draftory:identity-updated", invalidate);
      window.removeEventListener("draftory:results-updated", invalidate);
      window.removeEventListener("draftory:profile-updated", invalidate);
      window.removeEventListener("draftory:clans-updated", invalidate);
    };
  }, [viewer, disabled]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!view || !element) return;
    const position = () => {
      const box = view.anchor.getBoundingClientRect(),
        viewport = window.visualViewport;
      const p = hoverPosition(box, element.offsetWidth, element.offsetHeight, {
        width: viewport?.width ?? innerWidth,
        height: viewport?.height ?? innerHeight,
      });
      element.style.left = p.left + "px";
      element.style.top = p.top + "px";
    };
    if (element.showPopover && !element.matches(":popover-open"))
      element.showPopover();
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [view]);
  if (!view) return null;
  const data = view.data;
  return createPortal(
    <div
      ref={panel}
      popover="manual"
      className={s.card}
      role="dialog"
      aria-label="Mini perfil de jugador"
      data-player-hover-card
    >
      <button
        key="persistent-close"
        type="button"
        className={s.close}
        aria-label="Cerrar mini perfil"
        onClick={() => controls.current?.close(true)}
      >
        <X size={15} />
      </button>
      {data ? (
        <>
          <header className={s.header}>
            <div className={s.avatar}>
              <AvatarImage
                src={data.avatar ?? undefined}
                alt={data.name}
                size={52}
                className={s.avatar}
              />
            </div>
            <div className={s.copy}>
              <h2>
                <PlayerDisplayName name={data.name} tag={data.clan?.tag} />
              </h2>
              {data.publicId && <small>{data.publicId}</small>}
              <p className={s.muted}>{data.role ?? "Rol no indicado"}</p>
            </div>
            <div className={s.details}>
              <div className={s.identityBadges}>
                <LevelBadge
                  level={data.level}
                  isOwner={false}
                  playerName={data.name}
                />
                <span>Nivel {data.level}</span>
              </div>
              {!!data.socialLinks?.length && (
                <nav className={s.socials} aria-label="Redes públicas">
                  {data.socialLinks.map((link) => (
                    <SocialLink
                      key={link.platform}
                      platform={link.platform}
                      url={link.url}
                      context={
                        link.source === "STEAM_DERIVED"
                          ? "Generado desde Steam, solo visible para ti; perfil externo sin verificar"
                          : "Enlace publicado por el jugador, sin verificar"
                      }
                    />
                  ))}
                </nav>
              )}
            </div>
            {data.medal && (
              <div
                className={s.medal}
                title={
                  data.medal.source === "OPENDOTA_CACHE"
                    ? "Dato almacenado de OpenDota; no es una consulta en tiempo real"
                    : data.medal.source === "MANUAL_VERIFIED"
                      ? "Declaración validada por staff"
                      : data.medal.source === "MANUAL_PENDING"
                        ? "Medalla declarada, sin verificar"
                        : "Medalla guardada"
                }
              >
                <span className={s.medalGraphic}>
                  <DotaMedal
                    rankTier={data.medal.tier}
                    leaderboardRank={data.medal.leaderboardRank}
                    image={data.medal.image}
                    name={data.medal.name}
                  />
                </span>
                <span>
                  {data.medal.name}
                  {data.medal.stars ? ` · ${data.medal.stars} estrellas` : ""}
                  {data.medal.source?.startsWith("MANUAL") && (
                    <small>
                      {" "}
                      ·{" "}
                      {data.medal.source === "MANUAL_VERIFIED"
                        ? "Declarada · validada por staff"
                        : "Declarada"}
                    </small>
                  )}
                </span>
              </div>
            )}
          </header>
          <div className={s.body}>
            {(data.identityBadges?.staffRole ||
              data.identityBadges?.sponsor) && (
              <div className={s.distinctions}>
                <span className={s.label}>Distintivos oficiales</span>
                <div>
                  {data.identityBadges?.staffRole && (
                    <>
                      <StaffRoleBadge role={data.identityBadges.staffRole} />
                      <span>{data.identityBadges.staff}</span>
                    </>
                  )}
                  {data.identityBadges?.sponsor && <SponsorBadge />}
                </div>
              </div>
            )}
            <div className={s.competition}>
              <div>
                <p className={s.value}>
                  {data.elo.toLocaleString("es-ES")} <span>ELO</span>
                </p>
                <p className={s.rank}>
                  Clasificación general de Draftory
                  {data.rankPosition ? (
                    <strong>Puesto global #{data.rankPosition}</strong>
                  ) : (
                    <strong>Sin puesto público</strong>
                  )}
                </p>
              </div>
              <div className={s.record}>
                {data.stats.played ? (
                  <>
                    <strong>
                      {data.stats.winrate?.toLocaleString("es-ES", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      %
                    </strong>
                    <small>
                      {data.stats.wins} V · {data.stats.losses} D ·{" "}
                      {data.stats.played} partidas
                    </small>
                  </>
                ) : (
                  <small>Sin partidas 5v5</small>
                )}
                {data.mmr !== null && (
                  <small>
                    {data.mmrSource === "STAFF_VERIFIED"
                      ? "MMR verificado"
                      : data.mmrSource === "DECLARED"
                        ? "MMR declarado"
                        : "MMR Dota 2"}{" "}
                    · {data.mmr.toLocaleString("es-ES")}
                  </small>
                )}
              </div>
            </div>
            {data.achievements.length > 0 && (
              <div>
                <p className={s.label}>Logros desbloqueados</p>
                <ul className={s.badges}>
                  {data.achievements.slice(0, 4).map((a) => {
                    const Icon =
                      achievementIcons[a.id as keyof typeof achievementIcons] ??
                      Award;
                    return (
                      <li key={a.id}>
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={`${a.name}: ${a.description}`}
                        >
                          <Icon size={21} />
                          <span className={s.badgeTooltip} aria-hidden="true">
                            {a.name} · {a.description}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                  {(data.achievementCount ?? data.achievements.length) > 4 && (
                    <li>
                      <span title="Más insignias en el perfil completo">
                        +
                        {(data.achievementCount ?? data.achievements.length) -
                          4}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {data.clan && (
              <a href={"/clan/" + data.clan.id} className={s.clan}>
                <AvatarImage
                  src={data.clan.shield ?? undefined}
                  alt=""
                  size={44}
                  className={s.clanShield}
                />
                <span>
                  <strong>{data.clan.name}</strong>
                  <small>
                    {data.clan.tag} · {data.clan.count} integrantes
                  </small>
                  <small>Ver clan ↗</small>
                </span>
              </a>
            )}
            <a href={data.href} className={s.link}>
              Ver perfil completo
              <ArrowUpRight size={14} />
            </a>
          </div>
        </>
      ) : view.error ? (
        <div className={s.error}>
          <p role="status">{view.error}</p>
          {view.status !== 401 &&
            view.status !== 404 &&
            view.status !== 429 && (
              <button
                className={s.retry}
                onClick={() => controls.current?.retry()}
              >
                Reintentar
              </button>
            )}
        </div>
      ) : (
        <div
          className={s.loading}
          role="status"
          aria-label="Cargando mini perfil"
        >
          <div className={s.skeleton} />
          <div className={s.skeleton} />
          <div className={s.skeleton} />
          <p className={s.muted}>Cargando perfil…</p>
        </div>
      )}
    </div>,
    view.anchor.closest("dialog[open]") ?? document.body,
  );
}
