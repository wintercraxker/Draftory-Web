"use client";
import { SidebarNavigation } from "./SidebarNavigation";
import { SidebarAccount } from "./SidebarAccount";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { Changelog } from "./Changelog";
import { StoreComingSoon } from "./StoreComingSoon";
import { ShieldCheck } from "lucide-react";
import { DashboardTour } from "./DashboardTour";
import { CompetitiveMmr } from "./CompetitiveMmr";
import { DropdownField } from "./Dropdown";
import { useNotifications } from "./useNotifications";
import { NotificationPopover } from "./NotificationPopover";
import { useAuth } from "@/components/auth/AuthProvider";
import { ModerationStatus } from "@/components/moderation/ModerationStatus";
import type { SessionIdentity } from "@/lib/auth/types";
import { RealDashboardContent } from "@/components/auth/RealDashboardContent";

import { PredictionsPanel } from "./PredictionsPanel";
import { ProfileSettingsFields } from "./ProfileSettingsFields";
import { getPreferredRole, validatePreferredRoles } from "@/lib/dota-roles";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  defaultProfile,
  findProfile,
  profileHandle,
  buildPublicProfile,
  type PublicProfile,
  type PlayerProfileData,
} from "@/lib/player-profiles";
import { closeCommends, getRecognitionStats } from "@/lib/rooms/recognition";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Gamepad2,
  Users,
  X,
  LayoutDashboard,
  Settings,
  UserRound,
  Trophy,
  Store,
  ScrollText,
  Bell,
  LogOut,
  Diamond,
  Award,
  Menu,
  BookOpen,
} from "lucide-react";
import { createCompetitiveStats, type Player } from "@/lib/competitive";
import { useDraftoryAccount, useServerClock } from "./useDraftoryAccount";
import { PointsPanel, PointsPopover, PointsMovements } from "./PointsPanel";
import {
  createLobby,
  allPlayers,
  transitionLobby,
  type LobbyState,
  type RoomPlayer,
  type Action,
} from "@/lib/rooms/engine";
import { dispatchLocal } from "@/lib/rooms/local-transport";
import {
  activeRoomConflictCode,
  isActiveRoomPhase,
} from "@/lib/rooms/ownership";
import { CreateRoomDialog } from "./CreateRoomDialog";
import { demoPlayers } from "@/lib/rooms/mock";
import { applyDemoRoomAction, type DemoRoomAction } from "@/lib/rooms/demo";
import { RoomLobby } from "@/components/dashboard/RoomLobby";
import { CommendPanel } from "./CommendPanel";
import { useReadyRooms } from "@/components/dashboard/useReadyRooms";
import { PlayerProfile } from "@/components/dashboard/PlayerProfile";
import {
  recentMatches,
  completionToMatch,
  type DashboardMatch,
} from "@/lib/dashboard-data";
import { Overview } from "@/components/dashboard/Overview";
import { Classification } from "@/components/dashboard/Classification";
import { AvatarEditor } from "./AvatarEditor";
import { AvatarIdentityProvider, AvatarImage } from "./AvatarIdentity";
import {
  PageHeader,
  EmptyState,
  DashboardSkeleton,
  DashboardToast,
  LoadError,
} from "@/components/dashboard/DashboardUi";
import { RoomsBrowser } from "@/components/dashboard/RoomsBrowser";
import {
  MatchesPanel,
  type MatchesTab,
} from "@/components/dashboard/MatchesPanel";
import { DashboardDialog } from "@/components/dashboard/DashboardDialog";
import { mockRooms, roomStatusForPhase, type Room } from "@/lib/room-mock-data";

export type DashboardView =
  | "home"
  | "rooms"
  | "clan"
  | "matches"
  | "predictions"
  | "store"
  | "updates"
  | "classification"
  | "profile"
  | "settings"
  | "publicProfile"
  | "rules";
type View = DashboardView;
type Filter = "all" | "waiting" | "live" | "mine";
const actionClass = "dashboard-primary-button";

export default function DashboardApp({
  publicUsername,
  initialView,
  accountIdentity,
  demoMode = false,
  children,
}: {
  publicUsername?: string;
  initialView?: View;
  accountIdentity?: SessionIdentity;
  demoMode?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const { wallet, refreshWallet, user: staffIdentity } = useAuth();
  const [pointsNotice, setPointsNotice] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reward = (event: Event) => {
      const amount = (event as CustomEvent).detail?.pointsAwarded;
      if (
        typeof amount !== "string" ||
        !/^\d+$/.test(amount) ||
        BigInt(amount) <= BigInt(0)
      )
        return;
      setPointsNotice(
        `+${BigInt(amount).toLocaleString("en-US")} puntos · Recompensa Draftory`,
      );
      clearTimeout(timer);
      timer = setTimeout(() => setPointsNotice(""), 4500);
    };
    window.addEventListener("draftory:wallet-updated", reward);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("draftory:wallet-updated", reward);
    };
  }, []);
  const realPoints = {
    points: wallet?.balance ?? String(accountIdentity?.points ?? 0),
    weeklyGained: wallet?.weeklyGained,
    totalStaked: wallet?.totalStaked,
    entries: (wallet?.entries ?? []).map((e) => ({
      ...e,
      date: Date.parse(e.createdAt),
    })),
  };
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [realLobby, setRealLobby] = useState(false);
  const [chatContainer, setChatContainer] = useState<HTMLDivElement | null>(
    null,
  );
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () =>
      shellRef.current?.style.setProperty(
        "--dashboard-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, []);
  const [storedView, changeView] = useState<View>(initialView ?? "home");
  const view = publicUsername ? "publicProfile" : (initialView ?? storedView);
  function setView(next: View) {
    changeView(next);
    if (demoMode) {
      if (publicUsername) router.push("/demo");
      return;
    }
    const paths: Partial<Record<View, string>> = {
      home: "/dashboard",
      rooms: "/salas",
      matches: "/partidas",
      clan: "/clan",
      predictions: "/predicciones",
      store: "/tienda",
      updates: "/actualizaciones",
      classification: "/clasificacion",
      profile: "/perfil",
      settings: "/configuracion",
      rules: "/reglas",
    };
    router.push(paths[next] ?? "/dashboard");
  }
  const [matchesTab, setMatchesTab] = useState<MatchesTab>("live");
  const [demoProfile, setProfile] = useState(
    accountIdentity?.player ?? defaultProfile,
  );
  const profile = accountIdentity?.player ?? demoProfile;
  const [notifications, setNotifications] = useState(false);
  const notificationFeed = useNotifications(
    !!accountIdentity,
    accountIdentity?.id,
  );
  useEffect(() => {
    if (!notifications) return;
    const outside = (event: PointerEvent) => {
      if (
        !(event.target as HTMLElement).closest(
          '[data-notifications], [aria-label="Notificaciones"]',
        )
      )
        setNotifications(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotifications(false);
        document
          .querySelector<HTMLButtonElement>('[aria-label="Notificaciones"]')
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [notifications]);
  const navigation = [
    { id: "home", label: "Resumen", icon: LayoutDashboard },
    { id: "rooms", label: "Salas", icon: Users },
    { id: "matches", label: "Partidas", icon: Gamepad2 },
    ...(accountIdentity
      ? [{ id: "clan" as const, label: "Clan", icon: ShieldCheck }]
      : []),
    { id: "predictions", label: "Predicciones", icon: Diamond },
    { id: "store", label: "Tienda", icon: Store },
    { id: "classification", label: "Clasificación", icon: Trophy },
    { id: "updates", label: "Actualizaciones", icon: ScrollText },
    ...(accountIdentity
      ? [{ id: "rules" as const, label: "Reglas", icon: BookOpen }]
      : []),
    { id: "profile", label: "Mi perfil", icon: UserRound },
    { id: "settings", label: "Configuración", icon: Settings },
  ] as const;
  const [rooms, setRooms] = useState(accountIdentity ? [] : mockRooms);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [joined, setJoined] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [activeOwnedRoom, setActiveOwnedRoom] = useState<Room | null>(null);
  const ownershipStamp = useRef(0);
  const [creationBusy, setCreationBusy] = useState(false);
  const [privateJoin, setPrivateJoin] = useState<Room | null>(null),
    [joinBusy, setJoinBusy] = useState(false),
    [joinError, setJoinError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [avatarEditor, setAvatarEditor] = useState(false);
  const [pointsPopover, setPointsPopover] = useState(false);
  const [predictionMatchId, setPredictionMatchId] = useState<
    string | undefined
  >();
  const [demoLiveBusy, setDemoLiveBusy] = useState(false);
  const demoLiveSubmitting = useRef(false);
  const [pointsPanel, setPointsPanel] = useState<
    "history" | "predictions" | null
  >(null);
  const publicRoomIds = useRef(new Set<string>());
  const [lobbies, setLobbies] = useState<Record<string, LobbyState>>({});
  const lobbiesRef = useRef<Record<string, LobbyState>>({});
  const [rewarded, setRewarded] = useState(false);
  const [matches, setMatches] = useState<DashboardMatch[]>(
    accountIdentity ? [] : recentMatches,
  );
  const [selected, setSelected] = useState<Room | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (notice !== "Foto de perfil actualizada") return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const appliedMatches = useRef(new Set<string>());
  const latestProfileResult = useRef(-1);
  const [profileRetry, setProfileRetry] = useState(0);
  const [remoteProfile, setRemoteProfile] = useState<{
    handle: string;
    value: PublicProfile | null;
    error?: boolean;
  } | null>(null);
  const [serverTimes, setServerTimes] = useState<Record<string, number>>({});
  const readyRooms = useReadyRooms(
    (snapshot) => {
      if (
        snapshot.state.hostId === "self" &&
        snapshot.serverNow >= ownershipStamp.current
      ) {
        ownershipStamp.current = snapshot.serverNow;
        setActiveOwnedRoom((current) =>
          isActiveRoomPhase(snapshot.state.phase)
            ? snapshot.room
            : current?.id === snapshot.room.id
              ? null
              : current,
        );
      }
      commitLobby(snapshot.room.id, snapshot.state);
      recordFinished(snapshot.room, snapshot.state);
      setServerTimes((current) => ({
        ...current,
        [snapshot.room.id]: snapshot.serverNow,
      }));
      setRooms((current) =>
        current.some((room) => room.id === snapshot.room.id)
          ? current.map((room) =>
              room.id === snapshot.room.id ? snapshot.room : room,
            )
          : [snapshot.room, ...current],
      );
      setSelected((current) =>
        current?.id === snapshot.room.id ? snapshot.room : current,
      );
      setNotice((current) =>
        current.startsWith("Reconectando") ? "" : current,
      );
    },
    (message, unavailableRoomId) => {
      setNotice(message);
      if (!unavailableRoomId) return;
      setActiveOwnedRoom((current) =>
        current?.id === unavailableRoomId ? null : current,
      );
      // An expired demo session must not trap the user in a pending modal.
      const remaining = { ...lobbiesRef.current };
      delete remaining[unavailableRoomId];
      lobbiesRef.current = remaining;
      setLobbies(remaining);
      setRooms((current) =>
        current.filter((room) => room.id !== unavailableRoomId),
      );
      setSelected((current) =>
        current?.id === unavailableRoomId ? null : current,
      );
    },
    !accountIdentity,
  );
  const account = useDraftoryAccount(
    (records, ownedRoom, serverNow) => {
      if (serverNow >= ownershipStamp.current) {
        ownershipStamp.current = serverNow;
        setActiveOwnedRoom(ownedRoom);
      }
      const previous = publicRoomIds.current;
      publicRoomIds.current = new Set(records.map((room) => room.id));
      setRooms((current) => [
        ...records.map((room) =>
          readyRooms.hasSession(room.id)
            ? (current.find((item) => item.id === room.id) ?? room)
            : room,
        ),
        ...current.filter(
          (room) =>
            !previous.has(room.id) &&
            !records.some((record) => record.id === room.id),
        ),
      ]);
    },
    setProfile,
    !accountIdentity,
  );
  const predictionNow = useServerClock(account.serverNow);
  const visible = rooms.filter(
    (room) =>
      (filter === "all" ||
        (filter === "mine"
          ? (room.hostId ? room.hostId === "self" : room.host === "Kyowa") ||
            joined.includes(room.id)
          : room.status === filter)) &&
      `${room.title} ${room.host} ${room.mode} ${room.region}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );

  async function createPredictionDemo() {
    if (!account.token || demoLiveSubmitting.current) return;
    demoLiveSubmitting.current = true;
    setDemoLiveBusy(true);
    try {
      const response = await fetch("/api/demo/lobbies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.token}`,
        },
        body: JSON.stringify({ type: "demoLive" }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setRooms((current) => [
        value.room,
        ...current.filter((room) => room.id !== value.room.id),
      ]);
      publicRoomIds.current.add(value.room.id);
      await account.refresh();
      setMatchesTab("live");
      setSelected(null);
      setView(view === "predictions" ? "predictions" : "matches");
      setNotice(
        "Partida demo en vivo. La ventana de predicciones dura cinco minutos desde el inicio del servidor.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "No se pudo crear la prueba.",
      );
    } finally {
      demoLiveSubmitting.current = false;
      setDemoLiveBusy(false);
    }
  }
  async function simulateMatch(won = true) {
    try {
      const response = await fetch("/api/demo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "demoMvp", token: account.token, won }),
      });
      const value = await response.json();
      if (!response.ok && value.code === activeRoomConflictCode && value.room) {
        setActiveOwnedRoom(value.room);
        publicRoomIds.current.add(value.room.id);
        setNotice("Ya tienes una sala activa. Volviste a tu sala.");
        openRoom(value.room);
        return;
      }
      if (!response.ok) throw new Error(value.error);
      readyRooms.adopt(value.session, value.snapshot);
      account.accept(value.account);
      setRewarded(true);
      setSelected(null);
      setMatchesTab("history");
      setView("matches");
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Prueba demo no disponible.",
      );
    }
  }
  function recordFinished(room: Room, state: LobbyState) {
    if (!state.completion) return;
    const match = completionToMatch(room, state.completion, "self");
    if (match)
      setMatches((current) => [
        match,
        ...current.filter((item) => item.id !== match.id),
      ]);
    if (!match || appliedMatches.current.has(match.id)) return;
    appliedMatches.current.add(match.id);
    const self = [...state.completion.radiant, ...state.completion.dire].find(
      (player) => player.id === "self",
    );
    if (
      self &&
      match.eloChange !== undefined &&
      state.completion.finishedAt >= latestProfileResult.current
    ) {
      latestProfileResult.current = state.completion.finishedAt;
      setProfile((current) => ({
        ...current,
        elo: self.elo,
        xp: self.xp,
        level: self.level,
      }));
    }
  }
  async function demoLifecycle(
    event: "lobbySent" | "gameStarted" | "gameFinished",
    winningTeam?: "radiant" | "dire",
  ) {
    if (!selected) return;
    const state = lobbiesRef.current[selected.id];
    if (!state.attempt) return;
    try {
      await readyRooms.action(selected.id, state.hostId, {
        type: "demoLifecycle",
        attemptId: state.attempt.id,
        event,
        winningTeam,
      });
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Evento demo no disponible.",
      );
    }
  }
  useEffect(() => {
    if (accountIdentity || !publicUsername) return;
    const controller = new AbortController();
    fetch(`/api/demo/profiles/${encodeURIComponent(publicUsername)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const value: PublicProfile | null = response.ok
          ? await response.json()
          : null;
        if (controller.signal.aborted) return;
        setRemoteProfile({ handle: publicUsername, value });
        if (value?.profile.id === "self") {
          setMatches((current) =>
            [
              ...new Map(
                [...value.matches, ...current].map((match) => [
                  match.id,
                  match,
                ]),
              ).values(),
            ].sort((a, b) =>
              (b.playedAt ?? "").localeCompare(a.playedAt ?? "", "en-US"),
            ),
          );
          const latest = Math.max(
            -1,
            ...value.matches.flatMap((match) =>
              match.recognition?.results.some(
                (result) =>
                  result.playerId === "self" && result.eloChange !== undefined,
              )
                ? [match.recognition.finishedAt]
                : [],
            ),
          );
          if (latest > latestProfileResult.current) {
            latestProfileResult.current = latest;
            setProfile((current) => ({
              ...current,
              elo: value.profile.elo,
              xp: value.profile.xp,
              level: value.profile.level,
            }));
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRemoteProfile({
            handle: publicUsername,
            value: null,
            error: true,
          });
      });
    return () => controller.abort();
  }, [publicUsername, profileRetry, accountIdentity]);
  useEffect(() => {
    // The old live fixture can finish locally; authoritative sessions use SSE.
    const timers = Object.entries(lobbies).flatMap(([id, state]) => {
      if (
        !state.completion ||
        state.completion.finalized ||
        readyRooms.hasSession(id)
      )
        return [];
      return [
        setTimeout(
          () => {
            const current = lobbiesRef.current[id];
            if (!current?.completion) return;
            const completion = closeCommends(current.completion, Date.now());
            if (completion !== current.completion) {
              const next = { ...current, completion };
              commitLobby(id, next);
              const room = rooms.find((item) => item.id === id);
              if (room) recordFinished(room, next);
            }
          },
          Math.max(0, state.completion.voteEndsAt - Date.now()) + 10,
        ),
      ];
    });
    return () => timers.forEach(clearTimeout);
  }, [lobbies, readyRooms, rooms]);
  function publicProfileData(): PublicProfile | undefined {
    if (!publicUsername) return;
    const base = findProfile(publicUsername);
    const participant = Object.values(lobbies)
      .flatMap(allPlayers)
      .find(
        (player) =>
          player.id === publicUsername ||
          profileHandle(player) === publicUsername,
      );
    const remote =
      remoteProfile?.handle === publicUsername
        ? remoteProfile.value
        : undefined;
    const identity: PlayerProfileData | undefined =
      base?.id === "self" || publicUsername === "self"
        ? profile
        : participant
          ? {
              ...(base ?? {
                username: publicUsername,
                bio: "",
                country: "No especificado",
                region: "No especificada",
                visibility: "Público",
              }),
              ...participant,
              preferredRolePrimary: getPreferredRole(participant)!,
            }
          : (remote?.profile ?? base);
    if (!identity) return;
    const localCompletions = Object.values(lobbies).flatMap((state) =>
      state.completion ? [state.completion] : [],
    );
    const localMatches = Object.entries(lobbies).flatMap(([id, state]) => {
      const room = rooms.find((item) => item.id === id);
      const match =
        room && state.completion
          ? completionToMatch(room, state.completion, identity.id)
          : undefined;
      return match ? [match] : [];
    });
    const records = [
      ...new Map(
        [
          ...(remote?.matches ?? []),
          ...(identity.id === "self" ? matches : localMatches),
        ].map((match) => [match.id, match]),
      ).values(),
    ].sort((a, b) =>
      (b.playedAt ?? "").localeCompare(a.playedAt ?? "", "en-US"),
    );
    const recognition = [
      ...new Map(
        [
          ...(remote?.matches ?? []).flatMap((match) =>
            match.recognition ? [match.recognition] : [],
          ),
          ...localCompletions,
        ].map((match) => [match.id, match]),
      ).values(),
    ];
    return {
      ...buildPublicProfile(
        identity,
        records,
        recognition,
        identity.id === "self",
      ),
      achievements:
        identity.id === "self"
          ? account.data.achievements
          : remote?.achievements,
    };
  }
  const publicData = publicProfileData();
  function selfPlayer(): Player {
    return {
      id: "self",
      name: profile.name,
      avatar: profile.avatar,
      mmr: profile.mmr,
      elo: profile.elo,
      xp: profile.xp,
      level: profile.level,
      leaderboardRank: profile.leaderboardRank,
      dotaVisibility: profile.dotaVisibility,
      preferredRolePrimary: profile.preferredRolePrimary,
      preferredRoleSecondary: profile.preferredRoleSecondary,
    };
  }
  function commitLobby(id: string, next: LobbyState) {
    // Commands may arrive together (e.g. an automatic dice rematch). Each one
    // reads the latest accepted state rather than the previous React render.
    lobbiesRef.current = { ...lobbiesRef.current, [id]: next };
    setLobbies(lobbiesRef.current);
  }
  function requestCreateRoom() {
    if (activeOwnedRoom) {
      setNotice("Ya tienes una sala activa.");
      openRoom(activeOwnedRoom);
      return;
    }
    setNotice("");
    setCreating(true);
  }
  function openRoom(room: Room, entering = false) {
    if (!readyRooms.hasSession(room.id) && publicRoomIds.current.has(room.id)) {
      if (room.isPrivate && room.hostId !== "self") {
        setPrivateJoin(room);
        setJoinError("");
      } else void joinServerRoom(room);
      return;
    }
    let roster = lobbiesRef.current[room.id];
    if (!roster) {
      const players = demoPlayers(room.players);
      if (room.host === "Kyowa") players[0] = selfPlayer();
      else players[0] = { ...players[0], name: room.host };
      roster = createLobby(
        players[0].id,
        players,
        room.formation ?? "automatic",
        room.id,
      );
      if (room.status === "live")
        roster = {
          ...roster,
          phase: "IN_GAME",
          radiant: players.slice(0, 5),
          dire: players.slice(5, 10),
          bench: players.slice(10),
        };
    }
    if (
      entering &&
      !allPlayers(roster).some((player) => player.id === "self")
    ) {
      roster = transitionLobby(
        roster,
        { type: "join", player: selfPlayer() },
        "self",
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }
    if (entering && !joined.includes(room.id))
      setJoined((current) => [...current, room.id]);
    setRooms((current) =>
      current.map((item) =>
        item.id === room.id
          ? { ...item, players: allPlayers(roster).length }
          : item,
      ),
    );
    commitLobby(room.id, roster);
    setView("rooms");
    setSelected(room);
  }
  function joinRoom(room: Room) {
    openRoom(room, true);
  }
  async function joinServerRoom(room: Room, password?: string) {
    setJoinBusy(true);
    setJoinError("");
    try {
      const joinedRoom = await readyRooms.joinRoom(
        room.id,
        account.token,
        password,
      );
      setPrivateJoin(null);
      setSelected(joinedRoom);
      setView("rooms");
      setJoined((current) => [...new Set([...current, room.id])]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo entrar.";
      setJoinError(message);
      if (!room.isPrivate) setNotice(message);
    } finally {
      setJoinBusy(false);
    }
  }
  async function roomAction(action: Action, actor: string) {
    if (!selected) return false;
    try {
      if (readyRooms.hasSession(selected.id)) {
        await readyRooms.action(selected.id, actor, action);
        setNotice("");
        return true;
      }
      const time = new Date().toLocaleTimeString("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
      });
      const stored = lobbiesRef.current[selected.id];
      const sync = (players: RoomPlayer[]) =>
        players.map((player) =>
          player.id === "self"
            ? { ...selfPlayer(), roomRole: player.roomRole }
            : player,
        );
      const synced = {
        ...stored,
        radiant: sync(stored.radiant),
        dire: sync(stored.dire),
        bench: sync(stored.bench),
      };
      if (action.type === "start") {
        await readyRooms.start(synced, selected, actor);
        setNotice("");
        return true;
      }
      const next = dispatchLocal(synced, action, actor, time);
      commitLobby(selected.id, next);
      recordFinished(selected, next);
      setRooms((current) =>
        current.map((room) =>
          room.id === selected.id
            ? {
                ...room,
                players: allPlayers(next).length,
                status: roomStatusForPhase(next.phase),
              }
            : room,
        ),
      );
      setNotice("");
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Acción no disponible.",
      );
      return false;
    }
  }
  async function demoRoomAction(action: DemoRoomAction, actor: string) {
    if (!selected) return;
    try {
      if (readyRooms.hasSession(selected.id)) {
        await readyRooms.action(
          selected.id,
          actor,
          action === "allReady" || action === "nextReady"
            ? { type: action === "allReady" ? "demoAllReady" : "demoNextReady" }
            : { type: "demoRoom", action },
        );
        setNotice("");
        return;
      }
      const current = lobbiesRef.current[selected.id];
      const next = applyDemoRoomAction(current, action, actor, "Demo");
      commitLobby(selected.id, next);
      recordFinished(selected, next);
      setRooms((value) =>
        value.map((room) =>
          room.id === selected.id
            ? {
                ...room,
                players: allPlayers(next).length,
                status: roomStatusForPhase(next.phase),
              }
            : room,
        ),
      );
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Herramienta demo no disponible.",
      );
    }
  }

  const latestFinished = Object.values(lobbies)
    .filter(
      (state) =>
        state.completion &&
        [...state.completion.radiant, ...state.completion.dire].some(
          (player) => player.id === "self",
        ),
    )
    .sort((a, b) => b.completion!.finishedAt - a.completion!.finishedAt)[0];
  const isLobby =
    view === "rooms" && (accountIdentity ? realLobby : selected !== null);
  return (
    <AvatarIdentityProvider
      xp={profile.xp}
      level={profile.level}
      name={profile.name}
      id={profile.id}
      avatar={profile.avatar}
      preferredRolePrimary={profile.preferredRolePrimary}
      preferredRoleSecondary={profile.preferredRoleSecondary}
    >
      <div
        ref={shellRef}
        className={`dashboard-shell min-h-screen bg-[#09090b] text-zinc-100 ${isLobby ? "dashboard-lobby" : ""}`}
      >
        <header
          ref={headerRef}
          className="dashboard-header sticky top-0 z-40 border-b border-zinc-800 bg-[#09090b]/95 backdrop-blur-xl"
        >
          <div className="dashboard-header-inner flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2">
              <button
                data-tour="dashboard-mobile-menu"
                className="hub-button hub-button-ghost hub-button-icon dashboard-mobile-nav"
                aria-label="Abrir navegación"
                onClick={() => setMobileMenu(true)}
              >
                <Menu size={19} />
              </button>
              <Link
                href={demoMode ? "/demo" : "/dashboard"}
                className="dashboard-logo flex items-center gap-2 font-bold tracking-tight"
              >
                <Image src="/favicon.ico" width={32} height={32} alt="" />
                draftory<span className="text-zinc-500">.lol</span>
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                data-tour="dashboard-points"
                aria-expanded={pointsPopover}
                onClick={() => {
                  setPointsPopover((value) => !value);
                  setNotifications(false);
                  if (accountIdentity) void refreshWallet();
                }}
                title={`Puntos Draftory · ${(accountIdentity ? BigInt(realPoints.points) : account.data.points).toLocaleString("en-US")} puntos`}
                aria-label="Abrir puntos Draftory"
                className="dashboard-points-button"
              >
                <Diamond size={14} />
                {accountIdentity || account.token ? (
                  <span className="tabular-nums">
                    {(accountIdentity
                      ? BigInt(realPoints.points)
                      : account.data.points
                    ).toLocaleString("en-US")}
                  </span>
                ) : (
                  <span aria-label="Cargando saldo">…</span>
                )}
              </button>
              <button
                data-tour="dashboard-notifications"
                aria-label="Notificaciones"
                aria-expanded={notifications}
                onClick={() => {
                  setNotifications(!notifications);
                  setPointsPopover(false);
                  if (!notifications) void notificationFeed.refresh();
                }}
                className="hub-button hub-button-ghost hub-button-icon relative"
              >
                <Bell size={17} />
                {accountIdentity ? (
                  notificationFeed.feed.unreadCount > 0 && (
                    <span className="notification-count">
                      {notificationFeed.feed.unreadCount > 9
                        ? "9+"
                        : notificationFeed.feed.unreadCount}
                    </span>
                  )
                ) : (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-violet-300" />
                )}
              </button>
              {!accountIdentity && (
                <button
                  onClick={() => {
                    setSelected(null);
                    setView("profile");
                  }}
                  aria-label="Mi cuenta"
                  className="dashboard-account-button flex items-center gap-3 rounded-xl border border-zinc-800 px-3 py-2"
                >
                  <AvatarImage
                    hoverable={false}
                    id={profile.id}
                    src={profile.avatar}
                    size={32}
                    className="size-8 rounded-lg object-cover"
                  />
                  <span className="text-left">
                    <span className="block max-w-24 truncate text-xs font-semibold">
                      <PlayerDisplayName id={profile.id} name={profile.name} />
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      Mi cuenta
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
          {notifications &&
            (accountIdentity ? (
              <NotificationPopover
                feed={notificationFeed.feed}
                busy={notificationFeed.busy}
                error={notificationFeed.error}
                mark={notificationFeed.mark}
              />
            ) : (
              <div
                data-notifications
                className="dashboard-panel absolute right-5 top-[calc(100%+8px)] w-[min(320px,calc(100vw-40px))] shadow-xl"
                role="status"
              >
                <EmptyState
                  compact
                  icon={Bell}
                  title="Estás al día."
                  description="Las novedades de tu cuenta aparecerán aquí. Los eventos y turnos actuales se muestran dentro de la sala."
                />
              </div>
            ))}
        </header>
        {avatarEditor && (
          <AvatarEditor
            onClose={() => setAvatarEditor(false)}
            onSave={async (avatar) => {
              await account.saveAvatar(avatar);
              setNotice("Foto de perfil actualizada");
            }}
          />
        )}
        {accountIdentity && (
          <DashboardTour key={accountIdentity.id} userId={accountIdentity.id} />
        )}
        {pointsNotice && <DashboardToast text={pointsNotice} />}
        {notice === "Foto de perfil actualizada" && (
          <DashboardToast text="✓ Foto de perfil actualizada" />
        )}
        {pointsPopover && (
          <PointsPopover
            account={accountIdentity ? realPoints : account.data}
            onClose={() => setPointsPopover(false)}
            onPredictions={() => {
              setPointsPopover(false);
              setSelected(null);
              setView("predictions");
            }}
            serverNow={
              accountIdentity
                ? Date.parse(wallet?.serverNow ?? new Date().toISOString())
                : predictionNow
            }
            onHistory={() => {
              setPointsPopover(false);
              setPredictionMatchId(undefined);
              setPointsPanel("history");
            }}
          />
        )}
        {mobileMenu && (
          <DashboardDialog
            titleId="mobile-navigation-title"
            onClose={() => setMobileMenu(false)}
          >
            <div className="dashboard-panel mobile-navigation-shell p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2
                  id="mobile-navigation-title"
                  className="dashboard-section-title"
                >
                  Draftory
                </h2>
                <button
                  className="hub-button hub-button-ghost hub-button-icon"
                  aria-label="Cerrar navegación"
                  onClick={() => setMobileMenu(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <SidebarNavigation
                view={view}
                signedIn={!!accountIdentity}
                demoMode={demoMode}
                onNavigate={(id) => {
                  setMobileMenu(false);
                  setSelected(null);
                  setView(id);
                  setNotice("");
                }}
              />

              {accountIdentity ? (
                <SidebarAccount
                  canAccessStaff={!!staffIdentity?.staff?.canAccessStaff}
                  id={profile.id}
                  name={profile.name}
                  avatar={profile.avatar}
                  navigate={(id) => {
                    setMobileMenu(false);
                    setSelected(null);
                    setView(id);
                  }}
                />
              ) : (
                <Link className="dashboard-exit mt-5" href="/">
                  Salir de la demo
                </Link>
              )}
            </div>
          </DashboardDialog>
        )}
        {account.unlock && (
          <div role="status" className="achievement-toast">
            <Award size={21} />
            <div>
              <p>Logro desbloqueado</p>
              <strong>{account.unlock.name}</strong>
              <span>{account.unlock.description}</span>
            </div>
            <button aria-label="Cerrar logro" onClick={account.dismissUnlock}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="dashboard-workspace">
          <aside className="dashboard-sidebar hidden border-r border-zinc-800/80 px-4 py-6 lg:block">
            <div className="dashboard-sidebar-body flex flex-col">
              <div className="dashboard-sidebar-heading">
                <span className="size-1.5 rounded-full bg-violet-300/80" />
                <div>
                  <p>DRAFTORY</p>
                  <small>COMPETITIVE HUB</small>
                </div>
              </div>
              <SidebarNavigation
                view={view}
                signedIn={!!accountIdentity}
                demoMode={demoMode}
                onNavigate={(id) => {
                  setSelected(null);
                  setView(id);
                  setNotice("");
                }}
              />

              <div className="dashboard-sidebar-footer">
                {accountIdentity ? (
                  <SidebarAccount
                    canAccessStaff={!!staffIdentity?.staff?.canAccessStaff}
                    id={profile.id}
                    name={profile.name}
                    avatar={profile.avatar}
                    navigate={(id) => {
                      setSelected(null);
                      setView(id);
                      setNotice("");
                    }}
                  />
                ) : (
                  <Link
                    href="/"
                    className="dashboard-exit"
                    aria-label="Salir de la demo"
                    title="Salir de la demo"
                  >
                    <LogOut size={16} strokeWidth={1.8} />
                    <span>Salir de la demo</span>
                  </Link>
                )}
              </div>
            </div>
          </aside>
          <div
            className={`dashboard-content ${view === "store" ? "pb-8 pt-0" : "pb-20 pt-8"}`}
          >
            {accountIdentity?.mmrRequired &&
              ["home", "rooms", "matches"].includes(view) && (
                <CompetitiveMmr required />
              )}
            {accountIdentity && <ModerationStatus />}
            {!accountIdentity &&
              view !== "matches" &&
              view !== "store" &&
              !isLobby && (
                <div className="dashboard-breadcrumb mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 pb-4">
                  <p className="text-zinc-600">
                    Draftory Hub <span className="mx-2 text-zinc-700">/</span>{" "}
                    <span className="text-zinc-300">
                      {navigation.find((item) => item.id === view)?.label}
                    </span>
                  </p>
                  <span className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-500">
                    Vista previa · datos de ejemplo
                  </span>
                </div>
              )}
            {accountIdentity &&
              (children ? (
                children
              ) : view === "rules" ? (
                children
              ) : (
                <RealDashboardContent
                  user={accountIdentity}
                  view={view}
                  onView={setView}
                  chatContainer={chatContainer}
                  onLobbyChange={setRealLobby}
                />
              ))}
            {!accountIdentity && (
              <>
                {view === "store" && <StoreComingSoon />}
                {view === "updates" && <Changelog />}
                {view === "home" && (
                  <Overview
                    matches={matches}
                    xp={profile.xp}
                    elo={profile.elo}
                    name={profile.name}
                    onRooms={() => setView("rooms")}
                  />
                )}
                {view === "classification" && (
                  <Classification
                    player={selfPlayer()}
                    matches={matches}
                    role={profile.preferredRolePrimary ?? ""}
                    country={profile.country}
                    onProfile={() => setView("profile")}
                  />
                )}
                {view === "publicProfile" &&
                  (publicData ? (
                    <PlayerProfile
                      profile={publicData.profile}
                      matches={publicData.matches}
                      roomCount={0}
                      publicView
                      onAvatar={
                        publicData.profile.id === "self"
                          ? () => setAvatarEditor(true)
                          : undefined
                      }
                      achievements={publicData.achievements}
                      stats={publicData.stats}
                      social={publicData.social}
                      onEdit={
                        publicData.profile.id === "self"
                          ? () => setView("settings")
                          : undefined
                      }
                      onHistory={
                        publicData.profile.id === "self"
                          ? () => {
                              setMatchesTab("history");
                              setView("matches");
                            }
                          : undefined
                      }
                    />
                  ) : remoteProfile?.handle !== publicUsername ? (
                    <DashboardSkeleton variant="profile" />
                  ) : remoteProfile?.error ? (
                    <LoadError
                      message="No se pudo cargar este perfil."
                      onRetry={() => setProfileRetry((value) => value + 1)}
                    />
                  ) : (
                    <EmptyState
                      icon={UserRound}
                      title="No encontramos este perfil."
                      description="Consulta los perfiles desde los nombres y avatares de Draftory."
                    />
                  ))}
                {!selected && view === "rooms" && (
                  <RoomsBrowser
                    rooms={rooms}
                    visible={visible}
                    lobbies={lobbies}
                    joined={joined}
                    query={query}
                    filter={filter}
                    notice={notice}
                    onQuery={setQuery}
                    onFilter={setFilter}
                    ownedRoom={activeOwnedRoom}
                    onCreate={requestCreateRoom}
                    onJoin={joinRoom}
                    onOpen={openRoom}
                    onMatches={() => {
                      setMatchesTab("live");
                      setView("matches");
                    }}
                  />
                )}
                {!selected && view === "matches" && (
                  <MatchesPanel
                    rooms={rooms}
                    lobbies={lobbies}
                    matches={matches}
                    joined={joined}
                    tab={matchesTab}
                    onTab={setMatchesTab}
                    onOpen={openRoom}
                    onRooms={() => {
                      setSelected(null);
                      setView("rooms");
                    }}
                    rewarded={rewarded}
                    onSimulate={simulateMatch}
                    onMvp={() => void simulateMatch()}
                    windows={account.windows}
                    predictions={account.data.predictions}
                    now={predictionNow}
                    onPredict={(id) => {
                      setSelected(null);
                      setView("predictions");
                      setPredictionMatchId(id);
                    }}
                    onDemoLive={() => void createPredictionDemo()}
                    demoBusy={demoLiveBusy}
                    notice={notice}
                    loading={account.loading}
                    error={account.error}
                    onRetry={account.retry}
                    mvpMatch={
                      latestFinished?.roomId.startsWith("mvp-demo-")
                        ? latestFinished.completion
                        : undefined
                    }
                    onCloseMvp={
                      latestFinished?.completion &&
                      !latestFinished.completion.finalized &&
                      readyRooms.hasSession(latestFinished.roomId)
                        ? () => {
                            void readyRooms
                              .action(latestFinished.roomId, "self", {
                                type: "demoCloseCommends",
                              })
                              .catch((error) => setNotice(error.message));
                          }
                        : undefined
                    }
                  />
                )}
                {view === "predictions" && (
                  <PredictionsPanel
                    account={account.data}
                    windows={account.windows}
                    now={predictionNow}
                    loading={account.loading}
                    error={account.error}
                    onRetry={account.retry}
                    onPredict={(id) => {
                      setPredictionMatchId(id);
                      setPointsPanel("predictions");
                    }}
                    onDemo={() => void createPredictionDemo()}
                  />
                )}
                {view === "profile" && (
                  <PlayerProfile
                    onAvatar={() => setAvatarEditor(true)}
                    achievements={account.data.achievements}
                    profile={profile}
                    matches={matches}
                    roomCount={
                      rooms.filter((room) => room.host === "Kyowa").length
                    }
                    onEdit={() => setView("settings")}
                    social={getRecognitionStats("self", [
                      ...matches.flatMap((match) =>
                        match.recognition ? [match.recognition] : [],
                      ),
                      ...Object.values(lobbies).flatMap((state) =>
                        state.completion ? [state.completion] : [],
                      ),
                    ])}
                    onHistory={() => {
                      setMatchesTab("history");
                      setSelected(null);
                      setView("matches");
                    }}
                  />
                )}
                {view === "settings" && (
                  <section className="dashboard-enter">
                    <PageHeader
                      eyebrow="Cuenta / Configuración"
                      title="Configura tu perfil"
                      description="Tu identidad en la arena. Personaliza cómo te ve la comunidad."
                    />
                    <form
                      key={view}
                      className="dashboard-panel dashboard-form mt-6 space-y-6 p-5 sm:p-6"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const name = String(data.get("name")).trim();
                        if (!name) return;
                        try {
                          const nextProfile = {
                            ...profile,
                            name,
                            bio: String(data.get("bio")).trim(),
                            region: String(data.get("region")),
                            ...validatePreferredRoles(
                              data.get("preferredRolePrimary"),
                              data.get("preferredRoleSecondary"),
                            ),
                            country: String(data.get("country")),
                            visibility: String(data.get("visibility")),
                            dotaVisibility: data.get(
                              "dotaVisibility",
                            ) as Player["dotaVisibility"],
                            ...createCompetitiveStats(Number(data.get("mmr"))),
                            elo: profile.elo,
                            xp: profile.xp,
                            level: profile.level,
                          };
                          const saved = await account.saveProfile(nextProfile);
                          setProfile(saved);
                          setNotice(
                            "Perfil guardado en el servidor de la demo.",
                          );
                          setView("profile");
                        } catch (error) {
                          setNotice(
                            error instanceof Error
                              ? error.message
                              : "No se pudo guardar el perfil.",
                          );
                        }
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <AvatarImage
                          hoverable={false}
                          id="self"
                          src={profile.avatar}
                          size={56}
                          alt="Avatar actual"
                          className="size-14 rounded-xl object-cover"
                        />
                        <div>
                          <p className="text-sm font-semibold">
                            Tu cuenta de Steam
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Avatar de ejemplo · @kyowa
                          </p>
                        </div>
                      </div>
                      <ProfileSettingsFields
                        profile={profile}
                        visibilityOptions={[
                          { value: "Público", label: "Público" },
                          { value: "Privado", label: "Privado" },
                          { value: "Solo amigos", label: "Solo amigos" },
                        ]}
                        mmrControl={
                          <label className="block text-sm">
                            MMR actual de Dota 2
                            <input
                              name="mmr"
                              type="number"
                              required
                              min={0}
                              step={1}
                              max={30000}
                              defaultValue={profile.mmr}
                              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3"
                            />
                            <span className="mt-2 block text-xs text-zinc-500">
                              La medalla se calcula a partir del MMR declarado.
                            </span>
                          </label>
                        }
                        dotaControls={
                          <label className="block text-sm">
                            Datos externos de Dota (demo)
                            <DropdownField
                              label={"Datos externos de Dota (demo)"}
                              options={[
                                { value: "unknown", label: "Sin verificar" },
                                {
                                  value: "private",
                                  label: "Perfil de Dota privado",
                                },
                                {
                                  value: "public",
                                  label: "Perfil de Dota público",
                                },
                              ]}
                              className="dashboard-dropdown-field mt-2 w-full"
                              name={"dotaVisibility"}
                              defaultValue={profile.dotaVisibility ?? "unknown"}
                            />
                            <span className="mt-2 block text-xs text-zinc-500">
                              No cambia las estadísticas internas de Draftory ni
                              verifica datos de Steam.
                            </span>
                          </label>
                        }
                      />
                      <p className="text-xs leading-5 text-zinc-500">
                        Los ajustes se guardan en el servidor de la demo y se
                        conservan al recargar mientras el proceso siga activo.
                        La privacidad de cuenta se aplicará al conectar las
                        cuentas reales.
                      </p>
                      <div className="flex gap-3">
                        <button type="submit" className={actionClass}>
                          Guardar cambios
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(null);
                            setView("profile");
                          }}
                          className="dashboard-button px-4 py-2 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </section>
                )}
                {(view === "profile" || view === "settings") && (
                  <p role="status" className="mt-5 text-sm text-emerald-300">
                    {notice}
                  </p>
                )}

                {creating && (
                  <CreateRoomDialog
                    hostName={profile.name}
                    busy={creationBusy || !account.token}
                    notice={notice}
                    storageNote="Sala guardada en el servidor de la demo; se conserva al recargar mientras el proceso siga activo."
                    onClose={() => setCreating(false)}
                    onSubmit={async (values, privateRoom) => {
                      const title = String(values.get("title")).trim();
                      if (!title || creationBusy) return;
                      if (activeOwnedRoom) {
                        setCreating(false);
                        requestCreateRoom();
                        return;
                      }
                      const room: Room = {
                        id: crypto.randomUUID(),
                        title,
                        mode: values.get("mode") as Room["mode"],
                        region: values.get("region") as Room["region"],
                        host: profile.name,
                        hostId: "self",
                        isPrivate: privateRoom,
                        players: 1,
                        status: "waiting",
                        formation: values.get("formation") as Room["formation"],
                      };
                      setCreationBusy(true);
                      try {
                        const result = await readyRooms.createRoom(
                          {
                            ...createLobby(
                              "self",
                              [selfPlayer()],
                              room.formation,
                              room.id,
                            ),
                            game: values.get(
                              "firstPickGame",
                            ) as LobbyState["game"],
                          },
                          room,
                          account.token,
                          privateRoom
                            ? String(values.get("roomPassword"))
                            : undefined,
                        );
                        const accepted = result.room;
                        setActiveOwnedRoom(accepted);
                        publicRoomIds.current.add(accepted.id);
                        setSelected(accepted);
                        setView("rooms");
                        setRooms((current) => [
                          accepted,
                          ...current.filter((item) => item.id !== accepted.id),
                        ]);
                        setJoined((current) => [
                          ...new Set([...current, accepted.id]),
                        ]);
                        setCreating(false);
                        setFilter("mine");
                        setQuery("");
                        setNotice(
                          result.existing
                            ? "Ya tienes una sala activa. Volviste a tu sala."
                            : `Creaste ${accepted.title} en esta demo.`,
                        );
                        void account.refresh();
                      } catch (error) {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : "No se pudo crear la sala.",
                        );
                      } finally {
                        setCreationBusy(false);
                      }
                    }}
                  />
                )}
                {selected && view === "rooms" && lobbies[selected.id] && (
                  <>
                    <RoomLobby
                      notice={notice}
                      serverNow={serverTimes[selected.id]}
                      chatContainer={chatContainer}
                      key={selected.id}
                      room={selected}
                      state={(() => {
                        const state = lobbies[selected.id];
                        const authoritative = readyRooms.hasSession(
                          selected.id,
                        );
                        const sync = (players: RoomPlayer[]) =>
                          players.map((player) =>
                            player.id === "self"
                              ? authoritative
                                ? {
                                    ...player,
                                    preferredRolePrimary:
                                      profile.preferredRolePrimary,
                                    preferredRoleSecondary:
                                      profile.preferredRoleSecondary,
                                  }
                                : { ...selfPlayer(), roomRole: player.roomRole }
                              : player,
                          );
                        return {
                          ...state,
                          radiant: sync(state.radiant),
                          dire: sync(state.dire),
                          bench: sync(state.bench),
                        };
                      })()}
                      viewerId="self"
                      onBack={() => {
                        setSelected(null);
                        setView("rooms");
                      }}
                      onAction={roomAction}
                      onDemo={demoRoomAction}
                      onLifecycle={demoLifecycle}
                      onPrivacy={async (isPrivate, password) => {
                        await readyRooms.action(
                          selected.id,
                          lobbiesRef.current[selected.id].hostId,
                          { type: "privacy", isPrivate, password },
                        );
                      }}
                    />
                  </>
                )}
              </>
            )}
          </div>
          {pointsPanel && accountIdentity && (
            <DashboardDialog
              titleId="real-points-title"
              onClose={() => setPointsPanel(null)}
            >
              <div className="dashboard-panel p-5 sm:p-6">
                <PageHeader
                  eyebrow="Draftory"
                  title="Historial de puntos"
                  description="Recompensas y movimientos de tu cuenta."
                />
                <h2 id="real-points-title" className="sr-only">
                  Puntos Draftory
                </h2>
                <p className="my-5 text-xl font-semibold tabular-nums">
                  {BigInt(realPoints.points).toLocaleString("en-US")}
                </p>
                <PointsMovements account={realPoints} />
                <button
                  className="dashboard-link-button mt-4"
                  onClick={() => setPointsPanel(null)}
                >
                  Cerrar
                </button>
              </div>
            </DashboardDialog>
          )}
          {pointsPanel && !accountIdentity && (
            <PointsPanel
              account={account.data}
              windows={account.windows}
              initialMatchId={predictionMatchId}
              onRefresh={account.refresh}
              serverNow={predictionNow}
              token={account.token}
              onAccount={account.accept}
              initialTab={pointsPanel}
              onClose={() => setPointsPanel(null)}
            />
          )}
          {privateJoin && (
            <DashboardDialog
              titleId="private-room-title"
              onClose={() => setPrivateJoin(null)}
            >
              <form
                className="dashboard-panel p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const password = String(
                    new FormData(event.currentTarget).get("password"),
                  );
                  void joinServerRoom(privateJoin, password);
                }}
              >
                <h2 id="private-room-title" className="dashboard-section-title">
                  Sala privada
                </h2>
                <p className="mt-3 text-xs text-zinc-500">
                  Esta sala requiere contraseña.
                </p>
                <input
                  aria-label="Contraseña de sala"
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={64}
                  className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs"
                />
                {joinError && (
                  <p role="status" className="mt-3 text-xs text-rose-200">
                    {joinError}
                  </p>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="dashboard-button px-3 py-2 text-xs"
                    onClick={() => setPrivateJoin(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={joinBusy || !account.token}
                    className="dashboard-primary-button"
                  >
                    {joinBusy ? "Entrando…" : "Entrar"}
                  </button>
                </div>
              </form>
            </DashboardDialog>
          )}
          {!isLobby && latestFinished && (
            <CommendPanel
              inline={false}
              state={latestFinished}
              actor="self"
              now={serverTimes[latestFinished.roomId]}
              onAction={async (action) => {
                if (readyRooms.hasSession(latestFinished.roomId))
                  return readyRooms.action(
                    latestFinished.roomId,
                    "self",
                    action,
                  );
                const current = lobbiesRef.current[latestFinished.roomId];
                const room = rooms.find(
                  (item) => item.id === latestFinished.roomId,
                );
                if (!current || !room) return;
                const next = dispatchLocal(current, action, "self", "Demo");
                commitLobby(room.id, next);
                recordFinished(room, next);
              }}
            />
          )}
          {isLobby && (
            <div ref={setChatContainer} className="dashboard-chat-rail" />
          )}
        </div>
      </div>
    </AvatarIdentityProvider>
  );
}
