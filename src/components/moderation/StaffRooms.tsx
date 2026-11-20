"use client";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  DoorOpen,
  ChevronRight,
  Users,
  MessageSquare,
  ShieldAlert,
  LockKeyhole,
  UserMinus,
  Trash2,
} from "lucide-react";
import { StaffIdentity } from "./StaffIdentity";
import { StaffButton, StaffEmpty } from "./StaffUi";
import type { StaffPermission } from "@/lib/real/staff-access";
import type { StaffFeed, ActionContext } from "./StaffManagement";
type Room = StaffFeed["rooms"][number];
type Action = (p: Record<string, unknown>, c?: ActionContext) => Promise<void>;
const phases: Record<string, string> = {
  WAITING: "En espera",
  READY: "Equipos completos",
  READY_CHECK: "Confirmando jugadores",
  PREPARING: "Preparando partida",
  WAITING_FOR_PLAYERS: "Esperando jugadores",
  IN_GAME: "En juego",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};
const teamLabel: Record<string, string> = {
  RADIANT: "Radiant",
  DIRE: "Dire",
  BENCH: "Reserva",
  SPECTATOR: "Espectador",
};
export function StaffRooms({
  feed,
  busy,
  onAction,
}: {
  feed: StaffFeed;
  busy: boolean;
  onAction: Action;
}) {
  const [id, setId] = useState(""),
    [query, setQuery] = useState("");
  const rooms = feed.rooms.filter((r) =>
    `${r.id} ${r.name} ${r.publicIdentity?.publicId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const selected = feed.rooms.find((r) => r.id === id);
  return (
    <section className="staff-room-layout" data-managed-drafts>
      <div className="staff-room-browser staff-surface">
        <div className="staff-section-heading">
          <div>
            <p className="staff-eyebrow">01 · SELECCIONAR SALA</p>
            <h2>
              Salas activas{" "}
              <span className="staff-status">{feed.rooms.length}</span>
            </h2>
          </div>
          <DoorOpen size={18} />
        </div>
        <label className="staff-search-row">
          <Search size={16} />
          <input
            aria-label="Localizar sala"
            placeholder="Nombre, ROOM-ID o ID interno"
            maxLength={128}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="staff-help">
          Hasta 30 salas recientes. Selecciona una para consultar sus
          herramientas.
        </p>
        <div className="staff-room-results">
          {rooms.map((r) => (
            <button
              key={r.id}
              className="staff-room-row"
              aria-pressed={id === r.id}
              onClick={() => setId(r.id)}
            >
              <span className="staff-room-row-title">
                <strong>{r.name}</strong>
                <ChevronRight size={16} />
              </span>
              <small>{r.publicIdentity?.publicId || r.id}</small>
              <span className="staff-room-row-meta">
                <span className="staff-status">
                  {phases[r.phase] || r.phase}
                </span>
                <span>
                  <Users size={12} />
                  {r.members.length} visibles
                </span>
              </span>
            </button>
          ))}
        </div>
        {!rooms.length && (
          <StaffEmpty>
            {query
              ? "No hay coincidencias en las salas cargadas. Prueba otro nombre o identificador."
              : "No hay salas activas para revisar."}
          </StaffEmpty>
        )}
      </div>
      {selected ? (
        <RoomDetail
          key={selected.id}
          room={selected}
          permissions={feed.access.permissions}
          busy={busy}
          onAction={onAction}
        />
      ) : (
        <div className="staff-room-selection-prompt staff-surface">
          <DoorOpen size={34} />
          <h2>Selecciona una sala</h2>
          <p>
            Consulta su contexto, revisa participantes y mensajes y accede a las
            acciones autorizadas desde un mismo lugar.
          </p>
          <span>
            <LockKeyhole size={14} />
            Las herramientas se habilitan según tus permisos y la fase real.
          </span>
        </div>
      )}
    </section>
  );
}
function RoomDetail({
  room,
  permissions,
  busy,
  onAction,
}: {
  room: Room;
  permissions: readonly StaffPermission[];
  busy: boolean;
  onAction: Action;
}) {
  const [tab, setTab] = useState("players"),
    [memberId, setMemberId] = useState("");
  const can = (p: StaffPermission) => permissions.includes(p);
  const safe =
    ["WAITING", "READY"].includes(room.phase) && !room.matches.length;
  const member = room.members.find((m) => m.userId === memberId);
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(max-width:1000px)").matches)
      detail.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, []);
  return (
    <div ref={detail} className="staff-room-detail staff-surface">
      <header className="staff-room-context">
        <div>
          <p className="staff-eyebrow">02 · CONTEXTO DE MODERACIÓN</p>
          <h2>{room.name}</h2>
          <p className="staff-record-id">
            {room.publicIdentity?.publicId || room.id}
          </p>
        </div>
        <span className="staff-status">{phases[room.phase] || room.phase}</span>
        <div className="staff-room-context-meta">
          <StaffIdentity
            user={room.creator}
            size={32}
            detail="Creador de la sala"
          />
          <span>
            <Users size={15} />
            {room.members.length} participantes visibles
          </span>
        </div>
      </header>
      <div
        className="staff-role-tabs staff-room-context-tabs"
        aria-label="Herramientas de la sala seleccionada"
      >
        <StaffButton
          variant={tab === "players" ? "primary" : "quiet"}
          aria-pressed={tab === "players"}
          onClick={() => setTab("players")}
        >
          <Users size={15} />
          Participantes <span>{room.members.length}</span>
        </StaffButton>
        {can("messages.moderate") && (
          <StaffButton
            variant={tab === "messages" ? "primary" : "quiet"}
            aria-pressed={tab === "messages"}
            onClick={() => setTab("messages")}
          >
            <MessageSquare size={15} />
            Mensajes <span>{room.messages.length}</span>
          </StaffButton>
        )}
        {(can("rooms.moderate") || can("rooms.kick")) && (
          <StaffButton
            variant={tab === "actions" ? "primary" : "quiet"}
            aria-pressed={tab === "actions"}
            onClick={() => setTab("actions")}
          >
            <ShieldAlert size={15} />
            Administración
          </StaffButton>
        )}
      </div>
      {!safe && (
        <p className="staff-alert staff-room-protected">
          <LockKeyhole size={16} />
          Roster protegido: no se permite retirar participantes ni cerrar esta
          sala.
        </p>
      )}
      {tab === "players" && (
        <section className="staff-room-tool-section">
          <div className="staff-tool-heading">
            <div>
              <h3>Participantes de la sala</h3>
              <p>
                Comprueba la identidad y el equipo antes de revisar una
                retirada.
              </p>
            </div>
            <Users size={17} />
          </div>
          {room.members.map((m) => (
            <div
              key={m.userId}
              data-member-id={m.userId}
              className="staff-room-member"
              data-selected={memberId === m.userId}
            >
              <StaffIdentity
                user={m.user}
                detail={[
                  teamLabel[m.team] || m.team,
                  m.user.draftoryIdentity?.publicId,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {safe && can("rooms.kick") && (
                <StaffButton
                  variant="quiet"
                  aria-expanded={memberId === m.userId}
                  aria-label={`Revisar retirada de ${m.user.displayName || m.user.username}`}
                  onClick={() =>
                    setMemberId(memberId === m.userId ? "" : m.userId)
                  }
                >
                  <UserMinus size={15} />
                  <span>Revisar retirada</span>
                </StaffButton>
              )}
            </div>
          ))}
          {!room.members.length && (
            <StaffEmpty>No hay participantes visibles en esta sala.</StaffEmpty>
          )}
          {member && safe && can("rooms.kick") && (
            <div key={member.userId} className="staff-danger-review">
              <h4>
                <UserMinus size={16} />
                Revisar retirada
              </h4>
              <p>
                Usuario:{" "}
                <strong>
                  {member.user.displayName || member.user.username}
                </strong>{" "}
                · Sala: <strong>{room.name}</strong>
              </p>
              <RoomAction
                title="Revisar retirada"
                busy={busy}
                submit={(reason) =>
                  onAction(
                    {
                      action: "kickRoom",
                      roomId: room.id,
                      userId: member.userId,
                      publicReason: reason,
                    },
                    {
                      target: `${member.user.displayName || member.user.username} · ${room.name} · ${room.publicIdentity?.publicId || room.id}`,
                      consequence:
                        "Se retirará únicamente a este participante de la sala en espera, tras comprobar la fase y la jerarquía en el servidor.",
                    },
                  )
                }
              />
            </div>
          )}
        </section>
      )}
      {tab === "messages" && can("messages.moderate") && (
        <section className="staff-room-tool-section">
          <div className="staff-tool-heading">
            <div>
              <h3>Mensajes recientes</h3>
              <p>
                Últimos 5 mensajes de usuario. Retirar contenido no modifica el
                roster.
              </p>
            </div>
            <MessageSquare size={17} />
          </div>
          {room.messages.map((m) => (
            <article className="staff-room-message" key={m.id}>
              <StaffIdentity
                user={m.author}
                size={32}
                detail={new Date(m.createdAt).toLocaleString("es-CO")}
              />
              <p>{m.body}</p>
              <details className="staff-message-tools">
                <summary>
                  <Trash2 size={14} />
                  Revisar retirada del mensaje
                  <ChevronRight size={14} />
                </summary>
                <RoomAction
                  title="Revisar retirada del mensaje"
                  busy={busy}
                  submit={(reason) =>
                    onAction(
                      {
                        action: "hideMessage",
                        roomId: room.id,
                        messageId: m.id,
                        publicReason: reason,
                      },
                      {
                        target: `${m.author?.displayName || m.author?.username || "Mensaje"} · ${room.name} · ${room.publicIdentity?.publicId || room.id}`,
                        consequence:
                          "Se retirará únicamente el mensaje seleccionado. El contenido original se conservará en la auditoría autorizada.",
                      },
                    )
                  }
                />
              </details>
            </article>
          ))}
          {!room.messages.length && (
            <StaffEmpty>
              No hay mensajes recientes de usuario en esta sala.
            </StaffEmpty>
          )}
        </section>
      )}
      {tab === "actions" && (
        <section className="staff-room-tool-section">
          <div className="staff-tool-heading">
            <div>
              <h3>Acciones administrativas</h3>
              <p>
                Los cambios sensibles requieren motivo, revisión y confirmación.
              </p>
            </div>
            <ShieldAlert size={18} />
          </div>
          {can("rooms.moderate") && (
            <div className="staff-room-danger-zone">
              <h4>
                <LockKeyhole size={16} />
                Cierre de sala en espera
              </h4>
              <p>
                Solo se puede cerrar una sala sin partida activa ni roster
                comprometido. No se alteran lobbies GC ni resultados.
              </p>
              {safe ? (
                <details>
                  <summary>
                    Preparar cierre de esta sala
                    <ChevronRight size={16} />
                  </summary>
                  <RoomAction
                    title="Revisar cierre de sala"
                    busy={busy}
                    submit={(reason) =>
                      onAction(
                        {
                          action: "closeRoom",
                          roomId: room.id,
                          publicReason: reason,
                        },
                        {
                          target: `${room.name} · ${room.publicIdentity?.publicId || room.id}`,
                          consequence:
                            "Se cerrará exclusivamente esta sala en espera. El servidor volverá a comprobar sus bloqueos antes de ejecutar la operación.",
                        },
                      )
                    }
                  />
                </details>
              ) : (
                <span className="staff-status">
                  Cierre bloqueado por la fase actual
                </span>
              )}
            </div>
          )}
          {can("rooms.kick") && (
            <p className="staff-help">
              Las retiradas individuales se preparan desde Participantes,
              seleccionando la cuenta correspondiente.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
function RoomAction({
  title,
  busy,
  submit,
}: {
  title: string;
  busy: boolean;
  submit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="staff-room-action"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length >= 3) void submit(reason);
      }}
    >
      <label className="staff-field">
        Motivo obligatorio
        <input
          className="staff-input"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label={"Motivo: " + title}
          placeholder="Explica el motivo de esta intervención"
        />
      </label>
      <StaffButton
        variant="danger"
        type="submit"
        loading={busy}
        disabled={reason.trim().length < 3}
      >
        <ShieldAlert size={14} />
        {title}
      </StaffButton>
    </form>
  );
}
