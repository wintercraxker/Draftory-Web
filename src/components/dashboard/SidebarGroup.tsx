"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export function SidebarGroup({
  label,
  icon: Icon,
  active,
  route,
  children,
  defaultOpen = false,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  route: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [state, setState] = useState({
    route,
    active,
    open: active || defaultOpen,
  });
  if (state.route !== route || state.active !== active)
    setState({ route, active, open: active || state.open });
  const open = state.open;
  const setOpen = (value: boolean) =>
    setState((current) => ({ ...current, open: value }));
  const id = useId();
  return (
    <section
      className="dashboard-nav-group"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(".sidebar-group-toggle")
            ?.focus();
        }
      }}
    >
      <button
        type="button"
        className="sidebar-group-toggle"
        title={label}
        aria-label={label}
        data-contains-active={active}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="sidebar-group-icon">
          <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className="sidebar-group-label">{label}</span>
        {active && (
          <span className="sidebar-group-current" aria-hidden="true" />
        )}
        <ChevronDown
          className="sidebar-group-chevron"
          size={14}
          aria-hidden="true"
        />
      </button>
      <div
        id={id}
        className="sidebar-group-content"
        data-open={open}
        inert={!open}
      >
        <div>{children}</div>
      </div>
    </section>
  );
}
