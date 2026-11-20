"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AccessScreen } from "../auth/AccessScreen";
import { PublicFooter } from "./PublicFooter";
import { Navbar } from "./Navbar";
import type { DashboardView } from "../dashboard/DashboardApp";
import dynamic from "next/dynamic";
const DashboardApp = dynamic(() => import("../dashboard/DashboardApp"), {
  loading: () => (
    <p role="status" className="p-6 text-sm text-zinc-400">
      Cargando Draftory…
    </p>
  ),
});

export function ApplicationFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, demoAllowed } = useAuth();
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isProfile = pathname.startsWith("/profile/");
  const isClan = pathname === "/clan" || pathname.startsWith("/clan/");
  const isMatchDetail = /^\/partidas\/[^/]+$/.test(pathname);
  const routes: Record<string, DashboardView> = {
    "/salas": "rooms",
    "/partidas": "matches",
    "/clan": "clan",
    "/predicciones": "predictions",
    "/tienda": "store",
    "/actualizaciones": "updates",
    "/clasificacion": "classification",
    "/perfil": "profile",
    "/configuracion": "settings",
    "/reglas": "rules",
  };
  const privateRoute =
    isDashboard || isProfile || isClan || isMatchDetail || !!routes[pathname];
  useEffect(() => {
    if (privateRoute && user?.onboardingRequired) router.replace("/onboarding");
  }, [pathname, privateRoute, router, user]);
  if (pathname === "/dev/multiplayer-test") return <>{children}</>;
  if (pathname === "/onboarding") {
    return <main className="min-h-screen">{children}</main>;
  }
  if (
    (pathname === "/demo" || pathname.startsWith("/demo/profile/")) &&
    demoAllowed
  )
    return (
      <main
        onClickCapture={(event) => {
          const anchor = (
            event.target as HTMLElement
          ).closest<HTMLAnchorElement>('a[href^="/profile/"]');
          if (!anchor) return;
          const href = `/demo${anchor.getAttribute("href")}`;
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          ) {
            anchor.href = href;
            return;
          }
          event.preventDefault();
          router.push(href);
        }}
      >
        <DashboardApp
          demoMode
          publicUsername={
            pathname.startsWith("/demo/profile/")
              ? decodeURIComponent(pathname.slice("/demo/profile/".length))
              : undefined
          }
        />
      </main>
    );
  if (privateRoute)
    return user?.player && !user.onboardingRequired ? (
      <main>
        <DashboardApp
          key={user.id}
          accountIdentity={user}
          initialView={
            isClan ? "clan" : isMatchDetail ? "matches" : routes[pathname]
          }
          publicUsername={
            isProfile
              ? decodeURIComponent(pathname.slice("/profile/".length))
              : undefined
          }
        >
          {pathname === "/reglas" || isMatchDetail ? children : undefined}
        </DashboardApp>
      </main>
    ) : user ? (
      <>{children}</>
    ) : (
      <AccessScreen />
    );
  return (
    <>
      <Navbar />
      <main className="pt-[88px]">
        <Suspense fallback={null}>
          <AuthNotice />
        </Suspense>
        {children}
      </main>
      <PublicFooter />
    </>
  );
}
