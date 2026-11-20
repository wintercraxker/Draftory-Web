"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption = {
  value: string;
  label: string;
  image?: string;
  disabled?: boolean;
};
type DropdownProps = {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  label: string;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
  triggerLabel?: string;
  id?: string;
};
// Shared form/room menu. Keep its portal inside a modal's top layer when present.
// Window measurements happen only in the open event, never during SSR.
export function DashboardDropdown({
  value,
  options,
  onChange,
  label,
  name,
  disabled,
  compact,
  fullWidth = false,
  className = "",
  triggerLabel,
  id: triggerId,
}: DropdownProps) {
  const id = useId(),
    anchor = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const current = options.find((option) => option.value === value);
  const close = (restore = false) => {
    setPosition(null);
    if (restore) anchor.current?.focus();
  };
  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setPosition(null);
    };
    const reposition = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !menu.current?.contains(event.target)
      )
        setPosition(null);
    };
    const rows = menu.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled)',
    );
    (
      menu.current?.querySelector<HTMLButtonElement>(
        '[aria-checked="true"]:not(:disabled)',
      ) ?? rows?.[0]
    )?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [position]);
  function open() {
    if (disabled) return;
    if (position) {
      close();
      return;
    }
    setContainer(anchor.current!.closest("dialog") ?? document.body);
    const rect = anchor.current!.getBoundingClientRect(),
      width = Math.min(fullWidth ? rect.width : 236, window.innerWidth - 16);
    const estimatedHeight = options.length * 42 + 16;
    const below = window.innerHeight - rect.bottom - 14,
      above = rect.top - 14;
    const upwards = below < estimatedHeight && above > below;
    const maxHeight = Math.min(
      estimatedHeight,
      Math.max(42, upwards ? above : below),
    );
    setPosition({
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: upwards ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
      maxHeight,
    });
  }
  return (
    <span
      className={`role-dropdown ${compact ? "role-dropdown-compact" : ""} ${className}`}
    >
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <button
        id={triggerId}
        type="button"
        ref={anchor}
        className="role-dropdown-trigger"
        disabled={disabled}
        title={current?.label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!position}
        aria-controls={position ? id : undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            if (!position) open();
          }
        }}
      >
        <span key={value} className="dropdown-current">
          {current?.image && (
            <Image
              src={current.image}
              alt={compact ? current.label : ""}
              width={18}
              height={18}
              unoptimized
            />
          )}
          {(!compact || !current?.image) &&
            (triggerLabel ?? current?.label ?? "Selecciona una opción")}
        </span>
        <ChevronDown size={compact ? 11 : 14} aria-hidden="true" />
      </button>
      {position &&
        container &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            className="dashboard-context-menu role-dropdown-menu"
            style={position}
            onKeyDown={(event) => {
              const rows = Array.from(
                  menu.current!.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitemradio"]:not(:disabled)',
                  ),
                ),
                index = rows.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
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
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (event.key === "Tab") {
                const dialog = anchor.current?.closest("dialog[open]");
                const targets = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    "a[href], button, input, select, textarea, [tabindex]",
                  ),
                ).filter(
                  (element) =>
                    element.tabIndex >= 0 &&
                    !element.matches(":disabled") &&
                    element.getClientRects().length > 0 &&
                    !menu.current?.contains(element) &&
                    (!dialog || dialog.contains(element)),
                );
                const next =
                  targets[
                    targets.indexOf(anchor.current!) + (event.shiftKey ? -1 : 1)
                  ];
                close();
                if (next) {
                  event.preventDefault();
                  next.focus();
                }
              }
            }}
          >
            {options.map((option) => (
              <button
                type="button"
                key={option.value ?? "none"}
                role="menuitemradio"
                disabled={option.disabled}
                aria-checked={value === option.value}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  close(true);
                }}
              >
                {option.image && (
                  <Image
                    src={option.image}
                    alt=""
                    width={22}
                    height={22}
                    unoptimized
                  />
                )}
                <span>{option.label}</span>
                {value === option.value && (
                  <Check size={14} className="ml-auto" />
                )}
              </button>
            ))}
          </div>,
          container,
        )}
    </span>
  );
}
export function DropdownField({
  defaultValue,
  ...props
}: Omit<DropdownProps, "value" | "onChange"> & { defaultValue?: string }) {
  const [value, setValue] = useState(
    defaultValue ?? props.options[0]?.value ?? "",
  );
  return <DashboardDropdown {...props} value={value} onChange={setValue} />;
}
