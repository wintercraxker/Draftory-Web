"use client";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

// Shared menu surface; triggers own anchoring and close/focus behavior.
export function ContextMenu({
  id,
  label,
  position,
  menuRef,
  children,
}: {
  id: string;
  label: string;
  position: CSSProperties;
  menuRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={label}
      style={position}
      className="dashboard-context-menu"
      onKeyDown={(event) => {
        const rows = Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
              '[role="menuitem"]',
            ) ?? [],
          ),
          index = rows.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === "ArrowDown"
            ? (index + 1) % rows.length
            : event.key === "ArrowUp"
              ? (index - 1 + rows.length) % rows.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? rows.length - 1
                  : null;
        if (next !== null) {
          event.preventDefault();
          rows[next]?.focus();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
