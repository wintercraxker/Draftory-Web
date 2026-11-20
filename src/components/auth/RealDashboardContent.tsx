"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import type { SessionIdentity } from "@/lib/auth/types";
import type { ProfileProjection } from "@/lib/real/types";
import { PrivateAccount } from "./PrivateAccount";
import type { DashboardView } from "@/components/dashboard/DashboardApp";
import { RealOverview } from "./RealOverview";
import { Changelog } from "../dashboard/Changelog";
import { ClanPanel } from "../clans/ClanPanel";
import { StoreComingSoon } from "../dashboard/StoreComingSoon";
import { RealPredictions } from "./RealPredictions";
import { RealAccount } from "./RealAccount";
import { RealRooms } from "./RealRooms";
import { RealMatches } from "./RealMatches";
import { RealClassification } from "./RealClassification";
export function RealDashboardContent({
  user,
  view,
  onView,
  chatContainer,
  onLobbyChange,
}: {
  user: SessionIdentity;
  view: DashboardView;
  onView: (view: DashboardView) => void;
  chatContainer?: HTMLElement | null;
  onLobbyChange: (open: boolean) => void;
}) {
  const path = usePathname();
  const [profile, setProfile] = useState<ProfileProjection | null>(null),
    [error, setError] = useState("");
  const other = view === "publicProfile" ? path.split("/").at(-1) : undefined;
  const target = view + ":" + (other ?? user.id);
  const [loadedTarget, setLoadedTarget] = useState("");
  const [profileRevision, setProfileRevision] = useState(0);
  useEffect(() => {
    const changed = () => setProfileRevision((n) => n + 1);
    window.addEventListener("draftory:profile-updated", changed);
    return () =>
      window.removeEventListener("draftory:profile-updated", changed);
  }, []);
  useEffect(() => {
    if (!["profile", "settings", "publicProfile", "home"].includes(view))
      return;
    const controller = new AbortController();
    fetch(
      "/api/profile" + (other ? "?handle=" + encodeURIComponent(other) : ""),
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setProfile(value);
          setLoadedTarget(target);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setProfile(null);
          setLoadedTarget(target);
          setError(reason.message);
        }
      });
    return () => controller.abort();
  }, [other, target, view, profileRevision]);
  if (view === "clan") return <ClanPanel />;
  if (view === "store") return <StoreComingSoon />;
  if (view === "updates") return <Changelog />;
  if (view === "rooms")
    return (
      <RealRooms
        userId={user.id}
        userName={user.name}
        chatContainer={chatContainer}
        onLobbyChange={onLobbyChange}
        onMatches={() => onView("matches")}
      />
    );
  if (view === "matches")
    return <RealMatches userId={user.id} onRooms={() => onView("rooms")} />;
  if (view === "classification")
    return <RealClassification onProfile={() => onView("profile")} />;
  if (["profile", "settings", "publicProfile", "home"].includes(view)) {
    if (loadedTarget !== target)
      return (
        <p role="status" className="text-sm text-zinc-400">
          Cargando perfil...
        </p>
      );
    if (error)
      return (
        <p role="alert" className="dashboard-panel rounded-xl p-5">
          {error}
        </p>
      );
    if (!profile)
      return (
        <p role="status" className="text-sm text-zinc-400">
          Cargando perfil...
        </p>
      );
    if ("projection" in profile) return <PrivateAccount profile={profile} />;
    if (view !== "home")
      return (
        <RealAccount
          key={profile.id + view}
          profile={profile}
          editing={view === "settings"}
          readOnly={profile.id !== user.id}
          onEdit={() => onView("settings")}
          onSaved={setProfile}
        />
      );
    return <RealOverview profile={profile} onRooms={() => onView("rooms")} />;
  }
  return view === "predictions" ? <RealPredictions /> : null;
}
