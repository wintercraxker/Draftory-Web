"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./NavbarAccount.module.css";
import { FaSteam } from "react-icons/fa6";
import { useAuth } from "@/components/auth/AuthProvider";

const publicNav = [
  { href: "/", label: "Inicio" },
  { href: "/#funcionamiento", label: "Cómo funciona" },
  { href: "/team", label: "Team" },
];

export function Navbar() {
  const { user, refresh } = useAuth();
  const userId = user?.id;
  const trigger = useRef<HTMLButtonElement>(null);
  const [staffAllowed, setStaffAllowed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    if (!accountOpen || !userId) return;
    const c = new AbortController();
    void fetch("/api/staff/access", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const v = r.ok ? await r.json() : null;
        if (!c.signal.aborted) setStaffAllowed(v?.canAccessStaff === true);
      })
      .catch(() => {
        if (!c.signal.aborted) setStaffAllowed(false);
      });
    return () => c.abort();
  }, [accountOpen, userId]);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!accountOpen) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-steam-account]"))
        setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        trigger.current?.focus();
      }
    };
    const navigate = () => setAccountOpen(false);
    window.addEventListener("popstate", navigate);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("popstate", navigate);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [accountOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="fixed left-0 right-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`flex h-[72px] w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-transparent bg-[#09090b]/95 px-5 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl transition-all duration-300 ${scrolled ? "max-w-[760px]" : "max-w-5xl"}`}
      >
        <Link
          href="/"
          onClick={() => setAccountOpen(false)}
          className="flex shrink-0 items-center"
          aria-label="draftory.lol"
        >
          <span className="mr-2 flex h-11 w-11 items-center justify-center transition-transform duration-300 hover:scale-110">
            <Image
              src="/favicon.ico"
              width={40}
              height={40}
              alt=""
              className="h-10 w-10 object-contain"
            />
          </span>
          <span className="brand-word text-[1.4rem] font-semibold tracking-tight text-white">
            draftory
          </span>
          <span className="brand-word ml-1 text-[1.4rem] font-semibold tracking-tight text-zinc-300">
            .lol
          </span>
        </Link>

        <nav
          className={`hidden items-center gap-6 overflow-hidden whitespace-nowrap text-sm text-white/55 transition-all duration-300 lg:flex ${scrolled ? "pointer-events-none max-w-0 translate-y-1 opacity-0" : "max-w-[560px] opacity-100"}`}
        >
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setAccountOpen(false)}
              className="transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <div className="relative" data-steam-account>
              <button
                ref={trigger}
                aria-expanded={accountOpen}
                aria-controls="landing-account"
                onClick={() => {
                  setStaffAllowed(false);
                  setAccountOpen((open) => !open);
                  void refresh().catch(() => {});
                }}
                className={`${styles.trigger} inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100`}
              >
                {user.avatar ? (
                  <Image
                    unoptimized={user.avatar.startsWith("/api/profile/avatar/")}
                    src={user.avatar}
                    width={28}
                    height={28}
                    alt=""
                    className="size-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-zinc-800">
                    {user.name[0]}
                  </span>
                )}
                <span className={`${styles.name} max-w-28 truncate`}>
                  <PlayerDisplayName id={user.id} name={user.name} />
                </span>
                <ChevronDown size={14} />
              </button>
              {accountOpen && (
                <div
                  id="landing-account"
                  className={`${styles.menu} absolute right-0 top-full mt-2 w-52 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-300 shadow-xl`}
                >
                  {[["/dashboard", "Ir al dashboard"]].map(([href, label]) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setAccountOpen(false)}
                      className="block rounded-lg px-3 py-2 transition hover:bg-zinc-900 hover:text-white"
                    >
                      {label}
                    </Link>
                  ))}
                  {staffAllowed && (
                    <Link
                      href="/staff"
                      onClick={() => setAccountOpen(false)}
                      className="block rounded-lg border border-amber-900 px-3 py-2 text-amber-300 transition hover:bg-zinc-900"
                    >
                      Panel de Staff
                    </Link>
                  )}
                  <form
                    action="/api/auth/logout"
                    method="post"
                    className="mt-1 border-t border-zinc-800 pt-1"
                  >
                    <button className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-zinc-900 hover:text-white">
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <a
              href="/api/auth/steam"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white"
            >
              <FaSteam className="h-4 w-4" />
              Iniciar sesión
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
