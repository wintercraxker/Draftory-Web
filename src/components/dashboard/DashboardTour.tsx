"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles, X } from "lucide-react";
import { DashboardButton } from "./DashboardUi";
import { tourBackdrop } from "@/lib/tour/backdrop";
import { placeTour } from "@/lib/tour/placement";
import { tourSteps, validTourStep } from "@/lib/tour/steps";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "../auth/AuthProvider";
type State = {
  installed: boolean;
  eligible: boolean;
  status: string;
  step: number;
  images?: string[];
};
export function DashboardTour({ userId }: { userId: string }) {
  const router = useRouter(),
    pathname = usePathname(),
    query = useSearchParams(),
    { user } = useAuth();
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const card = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null),
    inFlight = useRef(false);
  const open =
    !!state?.eligible &&
    !user?.mmrRequired &&
    ["NOT_STARTED", "IN_PROGRESS"].includes(state.status);
  const positioned = position !== null;
  const index = state && validTourStep(state.step) ? state.step : 0,
    step = tourSteps[index];
  const stepRoute =
    step.route?.includes("tab=mmr") && user?.mmrVerified
      ? "/configuracion?tab=dota"
      : step.route;
  useEffect(() => {
    if (!open || !stepRoute) return;
    const target = new URL(stepRoute, window.location.origin);
    if (
      pathname !== target.pathname ||
      (target.search && query.toString() !== target.search.slice(1))
    )
      router.push(stepRoute);
  }, [open, stepRoute, pathname, query, router]);
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const r = await fetch("/api/account/tour", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (r.ok && !controller.signal.aborted) setState(await r.json());
      } catch {}
    }
    void read();
    const replay = () => void read();
    window.addEventListener("draftory:tour-replay", replay);
    return () => {
      controller.abort();
      window.removeEventListener("draftory:tour-replay", replay);
    };
  }, [userId]);
  async function save(status: string, next: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, step: next }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "No se pudo guardar el recorrido.");
      setState((old) => ({ ...v, images: old?.images }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el recorrido.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement;
    return () => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const same = (
      a: { left: number; top: number; width?: number; height?: number } | null,
      b: { left: number; top: number; width?: number; height?: number } | null,
    ) =>
      a === b ||
      (!!a &&
        !!b &&
        a.left === b.left &&
        a.top === b.top &&
        a.width === b.width &&
        a.height === b.height);
    const selector = `[data-tour="${step.id}"]`;
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const toggle = element
        .closest(".dashboard-nav-group")
        ?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
      toggle?.click();
    }
    function update() {
      setViewport((old) =>
        old.width === window.innerWidth && old.height === window.innerHeight
          ? old
          : { width: window.innerWidth, height: window.innerHeight },
      );
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      const target = elements.find(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          e.getBoundingClientRect().height > 0,
      );
      const r = target?.getBoundingClientRect(),
        highlight =
          index === 0 || index === tourSteps.length - 1 || !r
            ? null
            : {
                left: Math.max(4, r.left - 4),
                top: Math.max(4, r.top - 4),
                width: Math.min(r.width + 8, window.innerWidth - 8),
                height: r.height + 8,
              };
      setRect((old) => (same(old, highlight) ? old : highlight));
      const bounds = card.current?.getBoundingClientRect();
      if (bounds) {
        const safe = getComputedStyle(card.current!);
        const next = placeTour(
          {
            width: window.innerWidth,
            height: window.innerHeight,
            safeTop: parseFloat(safe.getPropertyValue("--tour-safe-top")) || 0,
            safeBottom:
              parseFloat(safe.getPropertyValue("--tour-safe-bottom")) || 0,
          },
          { width: bounds.width, height: bounds.height },
          highlight,
        );
        setPosition((old) => (same(old, next) ? old : next));
      }
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    ).find((e) => e.getBoundingClientRect().width > 0);
    target?.scrollIntoView({ block: "nearest", behavior: "auto" });
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    if (target)
      resize.observe(target.closest(".sidebar-group-content") ?? target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer.disconnect();
      resize.disconnect();
    };
  }, [open, step.id, index, pathname]);
  useEffect(() => {
    if (open && positioned) card.current?.focus({ preventScroll: true });
  }, [open, step.id, positioned]);
  if (!open)
    return (
      <>
        <TourBackdrop open={false} viewport={viewport} rect={rect} />
      </>
    );
  const welcome = index === 0,
    done = index === tourSteps.length - 1;
  const close = () => void save(done ? "COMPLETED" : "SKIPPED", index);
  return (
    <>
      <TourBackdrop open viewport={viewport} rect={rect} />
      {rect && (
        <div className="tour-spotlight" style={rect} aria-hidden="true" />
      )}
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        className="tour-card dashboard-panel"
        data-positioned={positioned}
        style={
          position ? { ...position, right: "auto", bottom: "auto" } : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            close();
          }
        }}
      >
        <button
          className="tour-dismiss hub-button hub-button-ghost hub-button-icon"
          aria-label={done ? "Cerrar recorrido" : "Omitir guía"}
          disabled={busy}
          onClick={close}
        >
          <X size={15} />
        </button>
        <div className="tour-artwork" aria-hidden="true">
          {state?.images?.includes(step.image) ? (
            <TourImage src={step.image} />
          ) : (
            <div className="tour-image-placeholder">
              <Sparkles size={32} />
              <span>Windranger</span>
            </div>
          )}
        </div>
        <div className="tour-content">
          <div className="tour-copy" key={step.id}>
            <p className="dashboard-label">
              {welcome
                ? "Windranger · Tu guía"
                : done
                  ? "Recorrido completado"
                  : `Paso ${index} de ${tourSteps.length - 2} · Windranger`}
            </p>
            <h2 id="tour-title" className="tour-title">
              {step.title}
            </h2>
            <p id="tour-description" className="tour-description">
              {step.description}
            </p>
          </div>
          {!welcome && !done && (
            <progress
              aria-label="Progreso del recorrido"
              max={tourSteps.length - 2}
              value={index}
              className="tour-progress"
            />
          )}
          {error && (
            <p role="alert" className="tour-error">
              {error}
            </p>
          )}
          <div className="tour-actions">
            {index > 0 && !done && (
              <DashboardButton
                disabled={busy}
                onClick={() => void save("IN_PROGRESS", index - 1)}
              >
                Anterior
              </DashboardButton>
            )}
            <DashboardButton
              variant="primary"
              busy={busy}
              onClick={() =>
                void save(
                  done ? "COMPLETED" : "IN_PROGRESS",
                  done ? index : index + 1,
                )
              }
            >
              {welcome
                ? "Comenzar recorrido"
                : done
                  ? "Explorar Draftory"
                  : "Siguiente"}
            </DashboardButton>
            <DashboardButton variant="ghost" disabled={busy} onClick={close}>
              {done ? "Cerrar recorrido" : welcome ? "Ahora no" : "Omitir guía"}
            </DashboardButton>
          </div>
        </div>
      </div>
    </>
  );
}
function TourImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="tour-image-placeholder">
      <Sparkles size={32} />
    </div>
  ) : (
    <Image
      unoptimized
      src={src}
      width={1024}
      height={1536}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

function TourBackdrop({
  open,
  viewport,
  rect,
}: {
  open: boolean;
  viewport: { width: number; height: number };
  rect: Parameters<typeof tourBackdrop>[1];
}) {
  return (
    <div className="tour-backdrop" data-open={open} aria-hidden="true">
      {tourBackdrop(viewport, rect).map((pane, i) => (
        <div key={i} className="tour-backdrop-pane" style={pane} />
      ))}
    </div>
  );
}
