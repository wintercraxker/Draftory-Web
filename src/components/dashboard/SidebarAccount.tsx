"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { AvatarImage } from "./AvatarIdentity";
import { PlayerDisplayName } from "../players/PlayerDisplayName";

export function SidebarAccount({
  id,
  name,
  avatar,
  navigate,
  canAccessStaff = false,
}: {
  id: string;
  name: string;
  avatar?: string;
  canAccessStaff?: boolean;
  navigate: (view: "profile" | "settings" | "clan") => void;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  function go(view: "profile" | "settings" | "clan") {
    setOpen(false);
    navigate(view);
  }
  return (
    <div ref={root} className="sidebar-account">
      {open && (
        <nav
          id={menuId}
          className="sidebar-account-menu"
          aria-label="Opciones de cuenta"
        >
          <button onClick={() => go("profile")}>
            <UserRound size={16} />
            Mi perfil
          </button>
          <button onClick={() => go("settings")}>
            <Settings size={16} />
            Configuración
          </button>
          {canAccessStaff && (
            <Link href="/staff" onClick={() => setOpen(false)}>
              <Shield size={16} />
              Panel de Staff
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button type="submit">
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </form>
        </nav>
      )}
      <button
        ref={button}
        type="button"
        className="sidebar-account-trigger"
        title={name}
        aria-label="Opciones de mi cuenta"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarImage
          id={id}
          hoverable={false}
          src={avatar}
          alt=""
          size={34}
          className="sidebar-account-avatar"
        />
        <span>
          <strong>
            <PlayerDisplayName id={id} name={name} />
          </strong>
          <small>Sesión iniciada</small>
        </span>
        <ChevronUp size={15} />
      </button>
    </div>
  );
}
