"use client";
import { Flag } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
const profileLabels = ["Dota 2", "Draftory", "Logros", "Historial"];
export function ProfileTabs({
  children,
  labels = profileLabels,
  ariaLabel = "Información del perfil",
  initialActive = 0,
  activeIndex,
  onActiveChange,
  icons,
}: {
  children: ReactNode[];
  labels?: readonly string[];
  ariaLabel?: string;
  initialActive?: number;
  activeIndex?: number;
  onActiveChange?: (index: number) => void;
  icons?: ReactNode[];
}) {
  const [localActive, setLocalActive] = useState(
      Math.max(0, Math.min(initialActive, labels.length - 1)),
    ),
    id = useId();
  const active = activeIndex ?? localActive;
  function setActive(index: number) {
    setLocalActive(index);
    onActiveChange?.(index);
  }
  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="profile-tab-bar flex overflow-x-auto scrollbar-hide"
      >
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel-${i}`}
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            className={`profile-tab shrink-0 ${label === "Reportar jugador" ? "profile-tab-report" : ""}`}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              let next = i;
              if (e.key === "ArrowRight") next = (i + 1) % labels.length;
              else if (e.key === "ArrowLeft")
                next = (i + labels.length - 1) % labels.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = labels.length - 1;
              else return;
              e.preventDefault();
              setActive(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {icons?.[i] ??
              (label === "Reportar jugador" && (
                <Flag size={13} aria-hidden="true" />
              ))}
            {label}
          </button>
        ))}
      </div>
      {children.map((child, i) => (
        <div
          key={i}
          className="profile-tab-panel"
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={active !== i}
          tabIndex={0}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
