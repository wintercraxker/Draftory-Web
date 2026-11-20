"use client";
import { useEffect, type RefObject } from "react";
export function sidebarOverflow(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight + 1 ? "auto" : "clip";
}
export function useSidebarOverflow(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const measure = () => {
      const top = nav.getBoundingClientRect().top - nav.scrollTop;
      const children = [...nav.children].filter(
        (child) => getComputedStyle(child).position !== "absolute",
      );
      const contentHeight =
        Math.max(
          0,
          ...children.map(
            (child) => child.getBoundingClientRect().bottom - top,
          ),
        ) + parseFloat(getComputedStyle(nav).paddingBottom || "0");
      const overflow = sidebarOverflow(contentHeight, nav.clientHeight);
      nav.style.overflowY = overflow;
      if (overflow === "clip") nav.scrollTop = 0;
    };
    measure();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(nav);
    for (const child of nav.children) observer?.observe(child);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);
}
