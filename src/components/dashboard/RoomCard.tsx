import {
  roomFormat,
  roomModeLabel,
  roomServerLabel,
} from "@/lib/rooms/lobby-options.mjs";
import { ArrowRight, Globe, LockKeyhole, Users } from "lucide-react";
import type { Room } from "@/lib/room-mock-data";

type RoomDetails = {
  assignedPlayers?: number;
  averageMmr?: number;
  averageElo?: number;
  isPrivate?: boolean;
};

export function RoomCard({
  room,
  mine,
  joined,
  details = {},
  onOpen,
  onJoin,
}: {
  room: Room;
  mine: boolean;
  joined: boolean;
  details?: RoomDetails;
  onOpen: () => void;
  onJoin: () => void;
}) {
  const playingSlots = roomFormat(room.mode).players;
  const available = Math.min(room.players, playingSlots);
  // Available participants are not confirmed team members. The bench has no cap.
  const slots = details.assignedPlayers ?? available;
  const complete = details.assignedPlayers === playingSlots;
  const status =
    room.status === "draft"
      ? "DRAFT EN CURSO"
      : room.status === "ready_check"
        ? "READY CHECK"
        : room.status === "preparing"
          ? "PREPARANDO PARTIDA"
          : room.status === "waiting_for_players"
            ? "ESPERANDO EN DOTA"
            : room.status === "live"
              ? "EN VIVO"
              : room.status === "finished"
                ? "TERMINADA"
                : complete
                  ? "COMPLETA"
                  : "BUSCANDO JUGADORES";
  const tone =
    room.status === "draft"
      ? "draft"
      : room.status === "live"
        ? "live"
        : room.status === "finished" || complete
          ? "muted"
          : "waiting";
  const returnToRoom = mine || joined;
  const viewOnly = room.status !== "waiting";
  const cta = returnToRoom ? "Volver a sala" : viewOnly ? "Ver sala" : "Unirme";
  return (
    <article className="dashboard-panel dashboard-room-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`dashboard-room-status dashboard-status-${tone}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {status}
        </span>
        {details.isPrivate && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400">
            <LockKeyhole size={12} />
            Privada
          </span>
        )}
      </div>
      <h3 className="dashboard-room-title">{room.title}</h3>
      <div className="dashboard-room-meta">
        <span className="dashboard-mode-badge">{roomModeLabel(room.mode)}</span>
        <span className="inline-flex items-center gap-1.5">
          <Globe size={12} strokeWidth={1.8} />
          {roomServerLabel(room.region)}
        </span>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Creada por{" "}
        <span className="font-medium text-zinc-300">{room.host}</span>
      </p>
      {room.status === "waiting" && (
        <div className="dashboard-room-occupancy">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Users size={13} strokeWidth={1.8} />
              {details.assignedPlayers !== undefined
                ? "Jugadores en equipos"
                : "Jugadores"}
            </span>
            <span className="text-xs tabular-nums">
              <strong className="font-semibold text-zinc-200">{slots}</strong>
              <span className="text-zinc-600"> / {playingSlots}</span>
            </span>
          </div>
          <div
            className="mt-2 h-0.5 overflow-hidden rounded-full bg-zinc-800"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-violet-300/45 transition-[width] duration-300"
              style={{ width: `${Math.min(slots / playingSlots, 1) * 100}%` }}
            />
          </div>
          {details.assignedPlayers === undefined && (
            <p className="mt-1.5 text-[9px] text-zinc-600">
              Para completar los equipos · banco abierto
            </p>
          )}
        </div>
      )}
      {(details.averageMmr !== undefined ||
        details.averageElo !== undefined) && (
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "MMR promedio", value: details.averageMmr },
            { label: "ELO promedio", value: details.averageElo },
          ]
            .filter((item) => item.value !== undefined)
            .map((item) => (
              <div key={item.label}>
                <dt className="dashboard-label">{item.label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">
                  {item.value!.toLocaleString("en-US")}
                </dd>
              </div>
            ))}
        </dl>
      )}
      <div className="dashboard-room-footer">
        <p className="text-[11px] text-zinc-500">
          {room.players.toLocaleString("en-US")} participantes
          <span className="mt-1 block text-[10px] text-zinc-600">
            {room.status === "live"
              ? "Partida en curso"
              : room.status === "finished"
                ? "Partida terminada"
                : room.status === "ready_check"
                  ? "Ready Check en curso"
                  : room.status === "preparing"
                    ? "Esperando al bot de Dota"
                    : room.status === "waiting_for_players"
                      ? "Esperando el inicio real"
                      : room.status === "draft"
                        ? "Capitanes eligiendo equipos"
                        : "Banco abierto"}
          </span>
        </p>
        <button
          onClick={returnToRoom || viewOnly ? onOpen : onJoin}
          className={`dashboard-room-cta ${returnToRoom ? "dashboard-button" : viewOnly ? "dashboard-link-button" : "dashboard-primary-button"}`}
        >
          {cta}
          <ArrowRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </article>
  );
}
