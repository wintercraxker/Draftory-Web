"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { SessionIdentity } from "@/lib/auth/types";
import {
  applyVisualIdentity,
  type VisualIdentity,
} from "@/lib/visual-identity";
import type { WalletDto } from "@/lib/real/points-repository";
import { useRoomPresence } from "./useRoomPresence";

const AuthContext = createContext<{
  user: SessionIdentity | null;
  wallet: WalletDto | null;
  refreshWallet: () => Promise<void>;
  demoAllowed: boolean;
  missingConfiguration: string[];
  refresh: () => Promise<void>;
  updateIdentity: (value: VisualIdentity) => void;
}>({
  user: null,
  wallet: null,
  refreshWallet: async () => {},
  demoAllowed: false,
  missingConfiguration: [],
  refresh: async () => {},
  updateIdentity: () => {},
});
export function AuthProvider({
  initialUser,
  demoAllowed,
  missingConfiguration,
  children,
}: {
  initialUser: SessionIdentity | null;
  demoAllowed: boolean;
  missingConfiguration: string[];
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  useRoomPresence(user && !user.onboardingRequired ? user.id : undefined);
  const [walletState, setWallet] = useState<{
    userId: string;
    value: WalletDto;
  } | null>(null);
  const wallet =
    walletState?.userId === user?.id ? (walletState?.value ?? null) : null;
  const walletRevision = useRef(0);
  const walletUserId = user?.id;
  const refreshWallet = useCallback(async () => {
    if (!walletUserId) return;
    const v = ++walletRevision.current;
    const r = await fetch("/api/wallet", { cache: "no-store" });
    if (r.ok) {
      const value = await r.json();
      if (v === walletRevision.current)
        setWallet({ userId: walletUserId, value });
    }
  }, [walletUserId]);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible")
        void refreshWallet().catch(() => {});
    };
    const init = setTimeout(update, 0),
      timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("draftory:wallet-updated", update);
    window.addEventListener("draftory:results-updated", update);
    return () => {
      clearTimeout(init);
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("draftory:wallet-updated", update);
      window.removeEventListener("draftory:results-updated", update);
    };
  }, [refreshWallet]);
  const revision = useRef(0);
  const resultRevision = useRef<string | undefined>(undefined);
  const updateIdentity = useCallback((value: VisualIdentity) => {
    revision.current++;
    setUser((old) => applyVisualIdentity(old, value));
    window.dispatchEvent(new Event("draftory:identity-updated"));
  }, []);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      const next = payload.user;
      if (version === revision.current) {
        setUser(next);
        const value =
          next && payload.progressRevision
            ? `${next.id}:${payload.progressRevision}`
            : undefined;
        if (value && value !== resultRevision.current)
          window.dispatchEvent(new Event("draftory:results-updated"));
        resultRevision.current = value;
      }
    }
  }, []);
  useEffect(() => {
    const update = () => {
      void refresh().catch(() => {});
    };
    const visible = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("draftory:profile-updated", update);
    document.addEventListener("visibilitychange", visible);
    const permissionTimer = setInterval(visible, 30000);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("draftory:profile-updated", update);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(permissionTimer);
    };
  }, [refresh]);
  return (
    <AuthContext.Provider
      value={{
        user,
        wallet,
        refreshWallet,
        demoAllowed,
        missingConfiguration,
        refresh,
        updateIdentity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
