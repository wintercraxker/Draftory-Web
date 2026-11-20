"use client";

import { useEffect, useRef, useState } from "react";

export function useActiveNavIndicator(active: string) {
  const ref = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({
    top: 0,
    height: 0,
    visible: false,
  });
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const link = nav.querySelector<HTMLElement>(
        '.dashboard-nav-item[aria-current="page"]',
      );
      const rect = link?.getBoundingClientRect();
      const value = rect
        ? {
            top:
              rect.top - nav.getBoundingClientRect().top + nav.scrollTop + 10,
            height: Math.max(4, rect.height - 20),
            visible: true,
          }
        : { top: 0, height: 0, visible: false };
      setIndicator((previous) =>
        previous.top === value.top &&
        previous.height === value.height &&
        previous.visible === value.visible
          ? previous
          : value,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    nav
      .querySelectorAll(".dashboard-nav-item")
      .forEach((link) => observer.observe(link));
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [active]);
  return { ref, indicator };
}
