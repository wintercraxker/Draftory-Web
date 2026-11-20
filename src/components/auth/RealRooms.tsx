"use client";
import { initializeSounds, playSound } from "@/lib/sounds/engine";
import { RoomPublicIdentity } from "../dashboard/RoomPublicIdentity";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LogOut, LockKeyhole, Eye, EyeOff } from "lucide-react";
import type { RealRoom } from "@/lib/real/types";
import { presentLobby, presentRoom } from "@/lib/real/presentation";
import type { Action } from "@/lib/rooms/engine";
import {
  RoomsBrowser,
  type RoomFilter,
} from "@/components/dashboard/RoomsBrowser";
const RoomLobby = dynamic(
  () => import("@/components/dashboard/RoomLobby").then((m) => m.RoomLobby),
  {
    loading: () => (
      <p role="status" className="text-xs text-zinc-500">
        Cargando sala…
      </p>
    ),
  },
);
const CreateRoomDialog = dynamic(() =>
  import("@/components/dashboard/CreateRoomDialog").then(
    (m) => m.CreateRoomDialog,
  ),
);
import { DashboardDialog } from "@/components/dashboard/DashboardDialog";
import { DashboardButton } from "@/components/dashboard/DashboardUi";
import { BotCapacityNotice, type BotCapacity } from "./BotCapacityNotice";

async function api(path: string, value?: object, signal?: AbortSignal) {
  const response = await fetch(path, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    ...(value
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }
      : { cache: "no-store" }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const supported: readonly Action["type"][] = [
  "move",
  "roomRole",
  "prepare",
  "captain",
  "replaceCaptain",
  "kick",
  "setFirstPickGame",
  "configure",
  "pick",
  "start",
  "confirmReady",
  "expireReadyCheck",
  "voteCancel",
  "chat",
  "releaseContinuation",
  "proposeBalance",
  "applyBalance",
  "cancelBalance",
  "leave",
];
export function RealRooms({
  userId,
  userName,
  chatContainer,
  onLobbyChange,
  onMatches,
}: {
  userId: string;
  userName: string;
  chatContainer?: HTMLElement | null;
  onLobbyChange: (open: boolean) => void;
  onMatches: () => void;
}) {
  const [rooms, setRooms] = useState<RealRoom[]>([]),
    [selected, setSelected] = useState<RealRoom | null>(null),
    [creating, setCreating] = useState(false);
  const [botCapacity, setBotCapacity] = useState<BotCapacity | null>(null);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<RoomFilter>("all");
  const [joinPasswordVisible, setJoinPasswordVisible] = useState(false);
  const [joining, setJoining] = useState<string | null>(null),
    [closing, setClosing] = useState(false);
  const mutation = useRef(false);
  const listVersion = useRef(0),
    detailVersion = useRef(0),
    detailRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const version = ++listVersion.current;
    const data = await api("/api/rooms", undefined, signal);
    if (version === listVersion.current && !signal?.aborted) {
      setRooms(data);
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const versions = listVersion;
    // SSE supplies the initial list. HTTP is a bounded fallback, not a duplicate
    // startup request that can overwrite a newer realtime snapshot.
    const fallback = setTimeout(() => {
      if (active)
        void reload(controller.signal).catch((error) => {
          if (active) setNotice(error.message);
        });
    }, 5000);
    const events = new EventSource("/api/rooms/events");
    events.onmessage = (event) => {
      if (!active) return;
      clearTimeout(fallback);
      listVersion.current++;
      setRooms(JSON.parse(event.data));
      setLoaded(true);
    };
    events.addEventListener("unavailable", () =>
      setNotice("Actualización temporalmente no disponible."),
    );
    return () => {
      active = false;
      controller.abort();
      versions.current++;
      clearTimeout(fallback);
      events.close();
      detailRequest.current?.abort();
    };
  }, [reload]);
  const observedRoom = useRef<{
    id: string;
    phase: string;
    captain: boolean;
  } | null>(null);
  useEffect(() => {
    initializeSounds();
    if (!selected) {
      observedRoom.current = null;
      return;
    }
    const current = {
      id: selected.id,
      phase: selected.phase,
      captain: !!selected.members?.find((m) => m.userId === userId)?.isCaptain,
    };
    const previous = observedRoom.current;
    if (previous?.id === current.id) {
      if (current.captain && !previous.captain)
        void playSound(
          "notification",
          "rooms",
          `captain:${current.id}:${selected.revision}`,
        );
      else if (
        previous.phase !== current.phase &&
        ["PREPARING", "WAITING_FOR_PLAYERS", "IN_GAME"].includes(current.phase)
      )
        void playSound(
          "success",
          "rooms",
          `room-phase:${current.id}:${current.phase}:${selected.revision}`,
        );
    }
    observedRoom.current = current;
  }, [selected, userId]);
  const lobbyOpen = !!selected?.members;
  useEffect(() => {
    onLobbyChange(lobbyOpen);
    return () => onLobbyChange(false);
  }, [lobbyOpen, onLobbyChange]);
  const revision = rooms.find((room) => room.id === selected?.id)?.revision;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const update = async () => {
      try {
        await reload(controller.signal);
        if (selected?.id) {
          const version = ++detailVersion.current;
          const room = await api(
            `/api/rooms/${selected.id}`,
            undefined,
            controller.signal,
          );
          if (active && version === detailVersion.current)
            setSelected((old) =>
              old && old.id === room.id && old.revision > room.revision
                ? old
                : room,
            );
        }
      } catch {}
    };
    window.addEventListener("draftory:identity-updated", update);
    window.addEventListener("focus", update);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("draftory:identity-updated", update);
      window.removeEventListener("focus", update);
    };
  }, [selected?.id, reload]);
  useEffect(() => {
    if (
      !selected?.id ||
      (revision !== undefined && selected.revision >= revision) ||
      mutation.current
    )
      return;
    const controller = new AbortController();
    detailRequest.current?.abort();
    detailRequest.current = controller;
    const version = ++detailVersion.current;
    fetch(`/api/rooms/${selected.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then((room) => {
        if (!controller.signal.aborted && version === detailVersion.current) {
          setSelected((old) =>
            old && old.id === room.id && old.revision > room.revision
              ? old
              : room.phase === "CANCELLED"
                ? null
                : room,
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && version === detailVersion.current) {
          setNotice(error.message);
          setSelected(null);
        }
      });
    return () => controller.abort();
  }, [selected?.id, selected?.revision, revision]);
  async function perform(roomId: string, action: object) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    detailVersion.current++;
    detailRequest.current?.abort();
    let operationConfirmed = false;
    try {
      const result = await api(`/api/rooms/${roomId}`, action);
      operationConfirmed = true;
      if (
        (action as { type?: string }).type === "confirmReady" ||
        (action as { action?: string }).action === "confirmReady"
      )
        void playSound(
          "confirmation",
          "rooms",
          `ready:${roomId}:${result.revision}`,
        );
      setSelected((old) =>
        old && old.id === result.id && old.revision > result.revision
          ? old
          : result.left || result.phase === "CANCELLED"
            ? null
            : result,
      );
      window.dispatchEvent(new Event("draftory:room-membership-updated"));
      setJoining(null);
      setClosing(false);
      await reload();
      return true;
    } catch (error) {
      if (!operationConfirmed)
        void playSound("error", "rooms", crypto.randomUUID());
      setNotice(
        operationConfirmed
          ? "Cambio guardado. No se pudo actualizar el listado; vuelve a cargarlo."
          : (error as Error).message,
      );
      try {
        setSelected(await api(`/api/rooms/${roomId}`));
      } catch {}
      // A failed list refresh cannot turn a committed operation into a failed save.
      return operationConfirmed;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const open = useCallback(async (roomId: string) => {
    const version = ++detailVersion.current;
    detailRequest.current?.abort();
    try {
      const room = await api(`/api/rooms/${roomId}`);
      if (version === detailVersion.current) {
        setSelected(room);
        setNotice("");
      }
    } catch (error) {
      if (version === detailVersion.current)
        setNotice((error as Error).message);
    }
  }, []);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("room");
    if (!requested || !/^[a-zA-Z0-9_-]{1,100}$/.test(requested)) return;
    const controller = new AbortController(),
      version = ++detailVersion.current;
    api(`/api/rooms/${requested}`, undefined, controller.signal)
      .then((room) => {
        if (!controller.signal.aborted && version === detailVersion.current)
          setSelected(room);
      })
      .catch((error) => {
        if (!controller.signal.aborted && version === detailVersion.current)
          setNotice(error.message);
      });
    return () => controller.abort();
  }, []);
  const [privateNotice, setPrivateNotice] = useState("");
  const cards = rooms.map(presentRoom),
    owned = rooms.find((room) => room.creatorId === userId);
  const create = () => {
    if (owned) void open(owned.id);
    else {
      setNotice("");
      setCreating(true);
    }
  };
  const visible = cards.filter(
    (room) =>
      (filter !== "waiting" || room.status === "waiting") &&
      (filter !== "mine" ||
        room.hostId === userId ||
        rooms.find((item) => item.id === room.id)?.joined) &&
      `${room.title} ${room.host} ${room.mode} ${room.region}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <BotCapacityNotice onAvailability={setBotCapacity} />
      {selected?.members ? (
        <RoomLobby
          key={selected.id}
          room={presentRoom(selected)}
          state={presentLobby(selected)}
          viewerId={userId}
          chatContainer={chatContainer}
          serverNow={selected.competitive?.serverNow}
          onMinigame={(move) =>
            perform(selected.id, {
              action: move ? "choose" : "roll",
              ...(move ? { move } : {}),
              roundId: selected.competitive?.roundId,
              expectedRevision: selected.revision,
              requestId: crypto.randomUUID(),
            })
          }
          availableActions={supported.filter(
            (action) =>
              !["start", "confirmReady"].includes(action) ||
              (botCapacity?.operationsEnabled === true &&
                !selected.competitive?.automationBlocker),
          )}
          startBlocker={
            selected.competitive?.automationBlocker ??
            (botCapacity?.operationsEnabled === true
              ? undefined
              : botCapacity
                ? "La admisión competitiva está cerrada. Puedes organizar la sala y usar el chat."
                : "Comprobando disponibilidad competitiva…")
          }
          notice={notice}
          onBack={() => setSelected(null)}
          onPrivacy={async (isPrivate, password) => {
            if (
              !(await perform(selected.id, {
                action: "privacy",
                isPrivate,
                ...(isPrivate ? { password } : {}),
                expectedRevision: selected.revision,
              }))
            )
              throw new Error(
                "No se guardó la privacidad. Revisa el aviso de la sala y vuelve a intentarlo.",
              );
          }}
          onAction={async (action) => {
            if (action.type === "move")
              return perform(selected.id, {
                action: "move",
                targetId: action.playerId,
                team: action.destination.toUpperCase(),
              });
            if (action.type === "roomRole")
              return perform(selected.id, {
                action: "role",
                role: action.role,
              });
            if (action.type === "leave")
              return perform(selected.id, { action: "leave" });
            const { type, ...fields } = action;
            const payload: Record<string, unknown> = {
              action: type,
              ...fields,
              expectedRevision: selected.revision,
              requestId: crypto.randomUUID(),
            };
            if ("playerId" in fields) {
              payload.targetId = fields.playerId;
              delete payload.playerId;
            }
            if (["confirmReady", "expireReadyCheck"].includes(type))
              payload.attemptId = selected.competitive?.attempt?.id;
            return perform(selected.id, payload);
          }}
          footer={
            <div className="room-member-controls flex flex-wrap items-center justify-between gap-3">
              <RoomPublicIdentity publicId={selected.publicId} />
              <div className="flex gap-2">
                {selected.joined &&
                  selected.creatorId === userId &&
                  selected.presenceEnabled && (
                    <DashboardButton
                      size="sm"
                      disabled={
                        busy ||
                        ![
                          "WAITING",
                          "CHOOSING_CAPTAINS",
                          "DECIDING_FIRST_PICK",
                          "DRAFTING",
                          "READY",
                        ].includes(selected.phase)
                      }
                      variant="ghost"
                      onClick={() => setClosing(true)}
                    >
                      Cerrar sala
                    </DashboardButton>
                  )}
                <DashboardButton
                  size="sm"
                  disabled={
                    busy ||
                    ![
                      "WAITING",
                      "CHOOSING_CAPTAINS",
                      "DECIDING_FIRST_PICK",
                      "DRAFTING",
                      "READY",
                    ].includes(selected.phase)
                  }
                  variant="ghost"
                  onClick={() =>
                    selected.joined
                      ? selected.creatorId === userId &&
                        !selected.presenceEnabled
                        ? setClosing(true)
                        : void perform(selected.id, { action: "leave" })
                      : void perform(selected.id, { action: "join" })
                  }
                >
                  <LogOut size={13} />
                  {!selected.joined
                    ? "Unirme"
                    : selected.creatorId === userId && !selected.presenceEnabled
                      ? "Cerrar sala"
                      : "Salir de la sala"}
                </DashboardButton>
              </div>
            </div>
          }
        />
      ) : (
        <>
          {!loaded && (
            <p role="status" className="mb-4 text-xs text-zinc-500">
              Cargando salas…
            </p>
          )}
          <RoomsBrowser
            rooms={cards}
            visible={visible}
            lobbies={{}}
            joined={rooms.filter((room) => room.joined).map((room) => room.id)}
            viewerId={userId}
            demo={false}
            roomDetails={Object.fromEntries(
              rooms.map((room) => [
                room.id,
                { assignedPlayers: room.assigned, isPrivate: room.isPrivate },
              ]),
            )}
            ownedRoom={owned ? presentRoom(owned) : null}
            query={query}
            filter={filter}
            notice={notice}
            onQuery={setQuery}
            onFilter={setFilter}
            onCreate={create}
            onMatches={onMatches}
            onOpen={(room) => void open(room.id)}
            onJoin={(room) => {
              setPrivateNotice("");
              setJoinPasswordVisible(false);
              if (room.isPrivate) setJoining(room.id);
              else void perform(room.id, { action: "join" });
            }}
          />
          <button
            className="dashboard-link-button mt-5 text-xs"
            onClick={() => {
              setNotice("");
              setPrivateNotice("");
              setJoinPasswordVisible(false);
              setJoining("");
            }}
          >
            <LockKeyhole size={13} />
            Entrar a una sala privada
          </button>
        </>
      )}
      {creating && (
        <CreateRoomDialog
          hostName={userName}
          busy={busy}
          notice={notice}
          storageNote="Sala persistente · tus jugadores entran al banco."
          onClose={() => setCreating(false)}
          onSubmit={async (values, privateRoom) => {
            if (mutation.current) return;
            mutation.current = true;
            setBusy(true);
            setNotice("");
            try {
              const result = await api("/api/rooms", {
                name: values.get("title"),
                mode: values.get("mode"),
                region: values.get("region"),
                formation: String(values.get("formation")).toUpperCase(),
                firstPickMethod: String(
                  values.get("firstPickGame"),
                ).toUpperCase(),
                isPrivate: privateRoom,
                ...(privateRoom
                  ? { password: values.get("roomPassword") }
                  : {}),
              });
              if (!result.existing)
                void playSound(
                  "success",
                  "rooms",
                  `room-created:${result.room.id}`,
                );
              setSelected(result.room);
              window.dispatchEvent(
                new Event("draftory:room-membership-updated"),
              );
              setCreating(false);
              await reload();
              if (result.existing)
                setNotice("Ya tienes una sala activa. Volviste a tu sala.");
            } catch (error) {
              setNotice((error as Error).message);
            } finally {
              mutation.current = false;
              setBusy(false);
            }
          }}
        />
      )}
      {joining !== null && (
        <DashboardDialog
          titleId="private-join-title"
          onClose={() => {
            if (!busy) {
              setJoining(null);
              setPrivateNotice("");
            }
          }}
        >
          <form
            className="dashboard-panel dashboard-form p-6"
            onSubmit={async (event) => {
              event.preventDefault();
              if (mutation.current) return;
              const data = new FormData(event.currentTarget),
                publicId = String(data.get("publicId") ?? "")
                  .trim()
                  .toUpperCase();
              if (!publicId) {
                setPrivateNotice("Introduce el ID de la sala.");
                return;
              }
              if (
                !/^ROOM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(publicId)
              ) {
                setPrivateNotice("Introduce un ID de sala válido.");
                return;
              }
              mutation.current = true;
              setBusy(true);
              setPrivateNotice("");
              try {
                const result = await api("/api/rooms/join", {
                  publicId,
                  password: data.get("password"),
                });
                setSelected(result);
                window.dispatchEvent(
                  new Event("draftory:room-membership-updated"),
                );
                setJoining(null);
                setNotice("");
                await reload();
              } catch (error) {
                setPrivateNotice((error as Error).message);
              } finally {
                mutation.current = false;
                setBusy(false);
              }
            }}
          >
            <h2 id="private-join-title" className="dashboard-section-title">
              <span className="room-access-heading">
                <span>
                  <LockKeyhole size={23} />
                </span>
                <span>
                  {rooms.find((r) => r.id === joining)?.name ??
                    "Entrar a una sala protegida"}
                </span>
              </span>
            </h2>
            <p className="room-access-description">
              Sala protegida. Introduce la contraseña que te facilitó el creador
              para solicitar acceso.
            </p>
            <label className="mt-5 block text-sm">
              ID de sala
              <input
                autoFocus={!joining}
                readOnly={!!joining}
                name="publicId"
                disabled={busy}
                defaultValue={
                  rooms.find((r) => r.id === joining)?.publicId ?? ""
                }
                maxLength={13}
                placeholder="ROOM-7K3P9X2N"
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
              />
            </label>
            <label className="mt-5 block text-sm">
              Contraseña
              <span className="room-access-input">
                <input
                  name="password"
                  autoFocus={!!joining}
                  type={joinPasswordVisible ? "text" : "password"}
                  required
                  disabled={busy}
                  maxLength={64}
                  autoComplete="off"
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                />
                <button
                  type="button"
                  disabled={busy}
                  aria-label={
                    joinPasswordVisible
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  aria-pressed={joinPasswordVisible}
                  onClick={() => setJoinPasswordVisible((value) => !value)}
                >
                  {joinPasswordVisible ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </span>
            </label>
            {privateNotice && (
              <p role="alert" className="mt-3 text-xs text-rose-200">
                {privateNotice}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <DashboardButton
                disabled={busy}
                variant="ghost"
                type="button"
                onClick={() => {
                  setJoining(null);
                  setJoinPasswordVisible(false);
                  setPrivateNotice("");
                }}
              >
                Cancelar
              </DashboardButton>
              <DashboardButton disabled={busy} type="submit" variant="primary">
                {busy ? "Comprobando…" : "Entrar a sala"}
              </DashboardButton>
            </div>
          </form>
        </DashboardDialog>
      )}
      {closing && (
        <DashboardDialog
          titleId="close-room-title"
          onClose={() => setClosing(false)}
        >
          <div className="dashboard-panel p-6">
            <h2 id="close-room-title" className="dashboard-section-title">
              Cerrar sala
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              La sala dejará de admitir jugadores.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <DashboardButton
                variant="ghost"
                onClick={() => setClosing(false)}
              >
                Cancelar
              </DashboardButton>
              <DashboardButton
                disabled={busy}
                variant="danger"
                onClick={() =>
                  selected && void perform(selected.id, { action: "close" })
                }
              >
                Cerrar sala
              </DashboardButton>
            </div>
            {notice && (
              <p role="alert" className="mt-3 text-xs text-rose-200">
                {notice}
              </p>
            )}
          </div>
        </DashboardDialog>
      )}
    </>
  );
}
