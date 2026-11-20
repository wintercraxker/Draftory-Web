"use client";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Shared level/recognition card: one surface, pointer bridge and viewport logic. */
export function BadgePopover({
  label,
  trigger,
  children,
  kind = "dialog",
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  kind?: "dialog" | "tooltip";
}) {
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const id = useId(),
    button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [open, setOpen] = useState(false);
  const pinned = useRef(false),
    hovered = useRef(false),
    suppressFocus = useRef(false);
  function cancelClose() {
    if (timer.current) clearTimeout(timer.current);
  }
  function show() {
    setPortalRoot(
      button.current?.closest("[data-player-hover-card]") ?? document.body,
    );
    cancelClose();
    setOpen(true);
  }
  function close() {
    cancelClose();
    pinned.current = false;
    setOpen(false);
  }
  function leave() {
    hovered.current = false;
    cancelClose();
    timer.current = setTimeout(() => {
      if (!pinned.current && document.activeElement !== button.current)
        setOpen(false);
    }, 180);
  }
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const b = button.current?.getBoundingClientRect(),
        p = panel.current;
      if (!b || !p) return;
      const margin = 12,
        width = p.offsetWidth,
        height = p.offsetHeight;
      p.style.left = `${Math.max(margin, Math.min(b.left, innerWidth - width - margin))}px`;
      const below = b.bottom + 8;
      p.style.top = `${Math.max(margin, Math.min(below + height <= innerHeight - margin ? below : b.top - height - 8, innerHeight - height - margin))}px`;
      p.style.visibility = "visible";
    };
    position();
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !button.current?.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      ) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pinned.current = false;
        setOpen(false);
        suppressFocus.current = true;
        button.current?.focus();
        suppressFocus.current = false;
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup={kind === "dialog" ? "dialog" : undefined}
        aria-describedby={open && kind === "tooltip" ? id : undefined}
        className="inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle leading-none transition hover:bg-violet-300/10 focus-visible:outline-2 focus-visible:outline-violet-300"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            hovered.current = true;
            show();
          }
        }}
        onPointerLeave={leave}
        onFocus={(e) => {
          if (
            !suppressFocus.current &&
            e.currentTarget.matches(":focus-visible")
          )
            show();
        }}
        onBlur={(e) => {
          if (!panel.current?.contains(e.relatedTarget)) {
            pinned.current = false;
            setOpen(false);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open && pinned.current) close();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role={kind}
            aria-label={`${label}: información`}
            onPointerEnter={() => {
              hovered.current = true;
              cancelClose();
            }}
            onPointerLeave={leave}
            style={{
              visibility: "hidden",
              maxHeight: "calc(100dvh - 24px)",
              overflowY: "auto",
            }}
            className="level-badge-popover dashboard-panel fixed z-[200] w-[min(300px,calc(100vw-24px))] rounded-xl border border-zinc-700/70 p-5 text-sm shadow-xl"
          >
            {children}
          </div>,
          portalRoot ?? document.body,
        )}
    </>
  );
}
