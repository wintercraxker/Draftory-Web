import {
  ArrowRight,
  Gamepad2,
  Plus,
  Search,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { allPlayers, type LobbyState } from "@/lib/rooms/engine";
import type { Room } from "@/lib/room-mock-data";
import { PageHeader, EmptyState } from "./DashboardUi";
import type { PredictionWindow } from "./useDraftoryAccount";
import { RoomCard } from "./RoomCard";

export type RoomFilter = "all" | "waiting" | "live" | "mine";
type Filter = RoomFilter;
const filters = [
  { id: "all", label: "Todas" },
  { id: "waiting", label: "Buscando jugadores" },
  { id: "mine", label: "Mis salas" },
] as const;

export function RoomsBrowser({
  rooms,
  visible,
  lobbies,
  joined,
  query,
  filter,
  notice,
  ownedRoom,
  onQuery,
  onFilter,
  onCreate,
  onJoin,
  onOpen,
  onMatches,
  viewerId = "self",
  demo = true,
  roomDetails,
}: {
  rooms: Room[];
  visible: Room[];
  lobbies: Record<string, LobbyState>;
  joined: string[];
  query: string;
  filter: Filter;
  notice: string;
  ownedRoom?: Room | null;
  onQuery: (query: string) => void;
  onFilter: (filter: Filter) => void;
  onCreate: () => void;
  onJoin: (room: Room) => void;
  onOpen: (room: Room) => void;
  windows?: PredictionWindow[];
  serverNow?: number;
  onPredict?: (id: string) => void;
  onMatches?: () => void;
  viewerId?: string;
  demo?: boolean;
  roomDetails?: Record<
    string,
    {
      assignedPlayers?: number;
      averageMmr?: number;
      averageElo?: number;
      isPrivate?: boolean;
    }
  >;
}) {
  const listed = visible.filter((room) => room.status !== "finished");
  const waiting = rooms.filter((room) => room.status === "waiting");
  const owns = (room: Room) =>
    room.hostId ? room.hostId === viewerId : demo && room.host === "Kyowa";
  const myRooms = rooms.filter(
    (room) => owns(room) || joined.includes(room.id),
  );
  // Existing demo records supply these counts; do not generate placeholder totals.
  const waitingPlayers = waiting.reduce(
    (total, room) => total + room.players,
    0,
  );
  return (
    <section className="dashboard-rooms dashboard-enter">
      <PageHeader
        eyebrow="Explorar / Salas"
        title="Encuentra una sala"
        description={`${waitingPlayers.toLocaleString("en-US")} participantes en salas abiertas${demo ? " · datos de ejemplo" : ""}`}
        action={
          <button onClick={onCreate} className="dashboard-primary-button">
            {!ownedRoom && <Plus size={16} strokeWidth={1.8} />}
            {ownedRoom ? "Volver a mi sala" : "Crear sala"}
            {ownedRoom && <ArrowRight size={16} />}
          </button>
        }
      />
      {ownedRoom && (
        <p className="mb-3 text-xs text-zinc-400">
          Ya tienes una sala activa:{" "}
          <span className="text-violet-200">{ownedRoom.title}</span>.
        </p>
      )}
      <dl className="dashboard-rooms-stats">
        {[
          { label: "Buscando jugadores", value: waiting.length, icon: Users },
          {
            label: "En vivo",
            value: rooms.filter((room) => room.status === "live").length,
            icon: Gamepad2,
          },
          { label: "Tus salas", value: myRooms.length, icon: Trophy },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon size={16} strokeWidth={1.8} className="text-zinc-500" />
            <dt className="text-[11px] text-zinc-400">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums text-zinc-100">
              {value.toLocaleString("en-US")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="dashboard-rooms-layout">
        <section className="min-w-0" aria-label="Salas disponibles">
          <div className="dashboard-rooms-toolbar">
            <div className="dashboard-tabs" aria-label="Filtros de salas">
              {filters.map(({ id, label }) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => onFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="dashboard-search">
              <Search size={16} strokeWidth={1.8} />
              <input
                aria-label="Buscar salas"
                placeholder="Buscar sala, modo o jugador…"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
              />
              {query && (
                <button
                  onClick={() => onQuery("")}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </label>
          </div>
          {notice && (
            <p role="status" className="mb-4 text-xs text-emerald-300">
              {notice}
            </p>
          )}
          <div className="dashboard-room-grid">
            {listed.map((room) => {
              const lobby = lobbies[room.id];
              const roster = lobby ? allPlayers(lobby) : [];
              const average = (key: "mmr" | "elo") => {
                const known = roster.filter(
                  (player) =>
                    Number.isFinite(player[key]) &&
                    (key !== "mmr" || player.mmrAvailable !== false),
                );
                return known.length
                  ? Math.round(
                      known.reduce((sum, player) => sum + player[key], 0) /
                        known.length,
                    )
                  : undefined;
              };
              return (
                <RoomCard
                  key={room.id}
                  room={room}
                  mine={owns(room)}
                  joined={joined.includes(room.id)}
                  details={
                    roomDetails?.[room.id] ?? {
                      isPrivate: room.isPrivate,
                      assignedPlayers: lobby
                        ? lobby.radiant.length + lobby.dire.length
                        : undefined,
                      averageMmr: average("mmr"),
                      averageElo: average("elo"),
                    }
                  }
                  onJoin={() => onJoin(room)}
                  onOpen={() => onOpen(room)}
                />
              );
            })}
          </div>
          {!listed.length && (
            <EmptyState
              icon={Users}
              title={
                filter === "mine" && !query
                  ? "No tienes salas todavía."
                  : "No hay salas con estos filtros."
              }
              description={
                filter === "mine" && !query
                  ? "Crea una sala y reúne a tus jugadores."
                  : "Prueba otra búsqueda o explora todas las salas disponibles."
              }
              action={
                filter === "mine" && !query ? (
                  <button
                    onClick={onCreate}
                    className="dashboard-primary-button"
                  >
                    {!ownedRoom && <Plus size={14} />}
                    {ownedRoom ? "Volver a mi sala" : "Crear sala"}
                    {ownedRoom && <ArrowRight size={14} />}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onQuery("");
                      onFilter("all");
                    }}
                    className="dashboard-button px-4 py-2 text-xs"
                  >
                    Ver todas las salas
                  </button>
                )
              }
            />
          )}
        </section>
      </div>
      {rooms.some((room) => room.status === "live") && onMatches && (
        <button
          className="dashboard-link-button mt-5 text-xs"
          onClick={onMatches}
        >
          Hay partidas en curso · Ver en Partidas →
        </button>
      )}
    </section>
  );
}
