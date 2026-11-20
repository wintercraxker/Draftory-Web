"use client";

import Link from "next/link";
import {
  BookOpen,
  Diamond,
  Gamepad2,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Store,
  Swords,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { SidebarGroup } from "./SidebarGroup";

export type SidebarDestination =
  | "home"
  | "rooms"
  | "matches"
  | "classification"
  | "clan"
  | "predictions"
  | "store"
  | "updates"
  | "rules";
const entries = {
  home: { label: "Resumen", href: "/dashboard", icon: LayoutDashboard },
  rooms: { label: "Salas", href: "/salas", icon: Users },
  matches: { label: "Partidas", href: "/partidas", icon: Gamepad2 },
  classification: {
    label: "Clasificación",
    href: "/clasificacion",
    icon: Trophy,
  },
  clan: { label: "Clan", href: "/clan", icon: ShieldCheck },
  predictions: { label: "Predicciones", href: "/predicciones", icon: Diamond },
  store: { label: "Tienda", href: "/tienda", icon: Store },
  updates: {
    label: "Actualizaciones",
    href: "/actualizaciones",
    icon: ScrollText,
  },
  rules: { label: "Reglas", href: "/reglas", icon: BookOpen },
} as const;
const groups = [
  {
    label: "Competitivo",
    icon: Swords,
    items: ["rooms", "matches", "classification"],
  },
  {
    label: "Comunidad",
    icon: UsersRound,
    items: ["clan", "predictions", "store"],
  },
  { label: "Información", icon: BookOpen, items: ["updates", "rules"] },
] satisfies {
  label: string;
  icon: typeof Swords;
  items: SidebarDestination[];
}[];

/** The same navigation is used in the fixed sidebar and the mobile drawer. */
export function SidebarNavigation({
  view,
  signedIn,
  demoMode,
  onNavigate,
}: {
  view: string;
  signedIn: boolean;
  demoMode: boolean;
  onNavigate: (view: SidebarDestination) => void;
}) {
  function route(id: SidebarDestination) {
    const { label, href, icon: Icon } = entries[id];
    return (
      <Link
        key={id}
        href={demoMode ? "/demo" : href}
        prefetch={false}
        className="dashboard-nav-item sidebar-route"
        aria-label={label}
        title={label}
        aria-current={view === id ? "page" : undefined}
        data-tour={
          "dashboard-" +
          (id === "home" ? "summary" : id === "classification" ? "ranking" : id)
        }
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          onNavigate(id);
        }}
      >
        <span className="dashboard-nav-icon">
          <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <nav
      tabIndex={0}
      className="dashboard-sidebar-nav sidebar-navigation"
      aria-label="Navegación principal"
    >
      {route("home")}
      {groups.map((group) => {
        const items = group.items.filter(
          (id) => signedIn || (id !== "clan" && id !== "rules"),
        );
        return (
          <SidebarGroup
            key={group.label}
            label={group.label}
            icon={group.icon}
            defaultOpen={group.label === "Competitivo"}
            active={items.some((id) => id === view)}
            route={view}
          >
            {items.map(route)}
          </SidebarGroup>
        );
      })}
    </nav>
  );
}
