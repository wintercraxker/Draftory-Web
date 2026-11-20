"use client";
import { useEffect, useRef, useState } from "react";
import { RoomLobby } from "../dashboard/RoomLobby";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { DashboardButton } from "../dashboard/DashboardUi";
import type { RealRoom } from "@/lib/real/types";
import type { Action } from "@/lib/rooms/engine";
import { presentLobby, presentRoom } from "@/lib/real/presentation";

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
  "proposeBalance",
  "applyBalance",
  "cancelBalance",
  "leave",
];
export function MultiplayerTest() {
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]),
    [actor, setActor] = useState("mp-player-1"),
    [roomId, setRoomId] = useState(""),
    [room, setRoom] = useState<RealRoom | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [chatContainer, setChatContainer] = useState<HTMLDivElement | null>(
    null,
  );
  async function api(path: string, body?: object) {
    const response = await fetch("/api/dev/multiplayer" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-draftory-test-player": actor,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value;
  }
  async function scenario(reset = false) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      const result = await api("/scenario", { reset });
      setPlayers(result.players);
      setRoomId(result.roomId);
      setNotice("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!roomId) return;
    const abort = new AbortController();
    const reload = () =>
      fetch(`/api/dev/multiplayer/rooms/${roomId}`, {
        headers: { "x-draftory-test-player": actor },
        cache: "no-store",
        signal: abort.signal,
      })
        .then(async (r) => {
          const value = await r.json();
          if (!r.ok) throw new Error(value.error);
          return value;
        })
        .then((value) => {
          if (!abort.signal.aborted) setRoom(value);
        })
        .catch((error) => {
          if (!abort.signal.aborted) setNotice(error.message);
        });
    void reload();
    const stream = new EventSource("/api/dev/multiplayer/events");
    stream.onmessage = () => void reload();
    return () => {
      abort.abort();
      stream.close();
    };
  }, [actor, roomId]);
  async function perform(body: Record<string, unknown>) {
    if (!room || mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    try {
      const result = await api("/rooms/" + room.id, body);
      setRoom(result.left ? await api("/rooms/" + room.id) : result);
      setNotice("");
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      try {
        setRoom(await api("/rooms/" + room.id));
      } catch {}
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function action(value: Action) {
    if (!room) return false;
    if (value.type === "move")
      return perform({
        action: "move",
        targetId: value.playerId,
        team: value.destination.toUpperCase(),
      });
    if (value.type === "roomRole")
      return perform({ action: "role", role: value.role });
    if (value.type === "leave") return perform({ action: "leave" });
    const { type, ...fields } = value;
    const body: Record<string, unknown> = {
      ...fields,
      action: type,
      expectedRevision: room.revision,
      requestId: crypto.randomUUID(),
    };
    if ("playerId" in fields) {
      body.targetId = fields.playerId;
      delete body.playerId;
    }
    if (["confirmReady", "expireReadyCheck"].includes(type))
      body.attemptId = room.competitive?.attempt?.id;
    return perform(body);
  }
  const member = room?.members?.some((p) => p.userId === actor);
  const editable =
    room &&
    [
      "WAITING",
      "CHOOSING_CAPTAINS",
      "DECIDING_FIRST_PICK",
      "DRAFTING",
      "READY",
    ].includes(room.phase);
  return (
    <main className="dashboard-shell min-h-screen bg-[#09090b] mx-auto max-w-[1600px] p-4 sm:p-8">
      <header className="dashboard-panel mb-5 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="dashboard-eyebrow">Desarrollo aislado · no Steam</p>
          <h1 className="dashboard-section-title">Multiplayer Test</h1>
          <p className="mt-2 text-xs text-zinc-500">
            Base y schema dedicados. 10 jugadores · ready 10/10 · cancelación
            8/10.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardDropdown
            label="Perspectiva de prueba"
            value={actor}
            options={players.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setActor}
            disabled={busy || !players.length}
          />
          <DashboardButton disabled={busy} onClick={() => void scenario()}>
            Crear / recuperar escenario
          </DashboardButton>
          <DashboardButton
            disabled={busy || !roomId}
            onClick={() => {
              if (
                window.confirm(
                  "¿Archivar el escenario aislado y crear uno nuevo? Ningún dato real se modifica.",
                )
              )
                void scenario(true);
            }}
          >
            Resetear escenario
          </DashboardButton>
        </div>
      </header>
      {notice && (
        <p role="alert" className="mb-4 text-sm text-rose-200">
          {notice}
        </p>
      )}
      {room?.phase === "CANCELLED" && (
        <p className="dashboard-panel mb-4 p-4 text-sm text-zinc-400">
          Sala cerrada. Crea o recupera otro escenario para continuar.
        </p>
      )}
      {room?.members && room.phase !== "CANCELLED" && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <RoomLobby
            key={room.id + actor}
            room={presentRoom(room)}
            state={presentLobby(room)}
            viewerId={actor}
            serverNow={room.competitive?.serverNow}
            availableActions={supported}
            chatContainer={chatContainer}
            notice={notice}
            onBack={() => setRoomId("")}
            onAction={action}
            onMinigame={(move) =>
              perform({
                action: move ? "choose" : "roll",
                ...(move ? { move } : {}),
                roundId: room.competitive?.roundId,
                expectedRevision: room.revision,
                requestId: crypto.randomUUID(),
              })
            }
            footer={
              <DashboardButton
                disabled={busy || !editable}
                onClick={() =>
                  void perform({
                    action: member
                      ? actor === room.creatorId
                        ? "close"
                        : "leave"
                      : "join",
                  })
                }
              >
                {member
                  ? actor === room.creatorId
                    ? "Cerrar sala"
                    : "Salir de la sala"
                  : "Volver a entrar"}
              </DashboardButton>
            }
          />
          <div
            ref={setChatContainer}
            className="sticky top-24 hidden h-[calc(100vh-8rem)] xl:block"
          />
        </div>
      )}
    </main>
  );
}
