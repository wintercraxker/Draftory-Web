"use client";

import { useEffect, useRef, useState } from "react";
import { roomConfig } from "@/lib/rooms/config";

export function EloValue({ value }: { value: number }) {
  const previous = useRef(value);
  const [change, setChange] = useState<number | null>(null);
  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    if (!delta) return;
    const frame = requestAnimationFrame(() => setChange(delta));
    const timer = setTimeout(
      () => setChange(null),
      roomConfig.statusHighlightMs,
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <span className="elo-value">
      {value.toLocaleString("en-US")}
      {change !== null && (
        <small
          key={`${value}-${change}`}
          className={`elo-feedback ${change > 0 ? "text-emerald-300/80" : "text-rose-300/80"}`}
        >
          {change > 0 ? "+" : ""}
          {change}
        </small>
      )}
    </span>
  );
}
