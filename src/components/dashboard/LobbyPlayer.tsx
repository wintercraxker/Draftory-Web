"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RoleBadge, RoleDropdown } from "./DotaRoles";
import { getRoomRole, type DotaRoleId } from "@/lib/dota-roles";
import { ContextMenu } from "./ContextMenu";
import {
  Check,
  ArrowUpRight,
  CornerDownLeft,
  Crown,
  ShieldCheck,
  Clock3,
  Ellipsis,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import type { Team, Invitation, RoomPlayer } from "@/lib/rooms/engine";
import { PlayerDotaMedal } from "./PlayerDotaMedal";
import Link from "next/link";
import { profileHref } from "@/lib/player-profiles";
import { DashboardBadge, DashboardButton } from "./DashboardUi";
import { DashboardDialog } from "./DashboardDialog";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";
import { type Player } from "@/lib/competitive";

function PlayerMenu({
  player,
  moves = [],
  selfJoin,
  onMove,
  onKick,
  onReplaceCaptain,
  pendingActions,
}: {
  player: Player;
  moves?: (Team | "bench")[];
  selfJoin?: boolean;
  onMove?: (destination: Team | "bench") => void;
  onKick?: () => void;
  onReplaceCaptain?: () => void;
  pendingActions?: string[];
}) {
  const name = player.name;
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    if (!position) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setPosition(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
        anchor.current?.focus();
      }
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  const open = () => {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = anchor.current!.getBoundingClientRect();
    const height =
      (moves.length + 1 + Number(!!onKick) + Number(!!onReplaceCaptain)) * 34 +
      32;
    setPosition({
      left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
      top:
        rect.bottom + height + 6 > window.innerHeight
          ? Math.max(8, rect.top - height - 6)
          : rect.bottom + 6,
    });
  };
  return (
    <>
      <button
        ref={anchor}
        onClick={open}
        aria-label={`Acciones de ${name}`}
        aria-haspopup="menu"
        aria-controls={position ? id : undefined}
        aria-expanded={!!position}
        className="grid size-6 place-items-center rounded-md text-zinc-500 transition duration-150 hover:bg-violet-300/10 hover:text-violet-200"
      >
        <Ellipsis size={15} />
      </button>
      {position && (
        <ContextMenu
          menuRef={menu}
          id={id}
          label={`Acciones de ${name}`}
          position={position}
        >
          <p className="truncate px-2 pb-1.5 pt-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            {selfJoin ? "Tu plaza" : name}
          </p>
          {moves.map((destination) => {
            const Icon =
              destination === "bench"
                ? CornerDownLeft
                : selfJoin
                  ? ArrowUpRight
                  : UserPlus;
            return (
              <button
                key={destination}
                role="menuitem"
                onClick={() => {
                  onMove?.(destination);
                  setPosition(null);
                  anchor.current?.focus();
                }}
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] text-zinc-300 outline-none transition duration-150 hover:bg-violet-300/[.07] hover:text-violet-100 focus-visible:bg-violet-300/[.07] focus-visible:text-violet-100"
              >
                <Icon size={13} className="shrink-0 text-zinc-500" />
                <span className="whitespace-nowrap">
                  {destination === "bench"
                    ? "Devolver al banco"
                    : `Subir a ${destination === "radiant" ? "Radiant" : "Dire"}`}
                </span>
              </button>
            );
          })}
          {pendingActions?.map((label) => (
            <button
              key={label}
              role="menuitem"
              disabled
              title="Pendiente de conectar al backend"
              className="opacity-40"
            >
              {label} <span className="text-[9px]">Pendiente</span>
            </button>
          ))}
          {onReplaceCaptain && (
            <button
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onReplaceCaptain();
              }}
            >
              <CornerDownLeft size={13} />
              Devolver al banco…
            </button>
          )}
          <Link
            role="menuitem"
            href={profileHref(player)}
            className="player-menu-profile"
            onClick={() => setPosition(null)}
          >
            <UserRound size={13} />
            Ver perfil
          </Link>
          {onKick && (
            <button
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onKick();
              }}
              className="player-menu-kick"
            >
              <X size={13} />
              Expulsar de la sala
            </button>
          )}
        </ContextMenu>
      )}
    </>
  );
}

function RoomRolePicker({
  player,
  onChange,
  disabled,
}: {
  player: RoomPlayer;
  onChange?: (role: DotaRoleId) => Promise<void | boolean>;
  disabled?: boolean;
}) {
  const [pendingRole, setPendingRole] = useState<DotaRoleId | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false),
    role = pendingRole ?? getRoomRole(player);
  return (
    <span className="player-card-link room-role-control">
      {onChange ? (
        <RoleDropdown
          compact
          emptyTrigger="Rol"
          label={`Rol de ${player.name} en esta sala`}
          value={role}
          disabled={disabled || !!pendingRole}
          onChange={async (value) => {
            if (!value || pending.current) return;
            pending.current = true;
            setPendingRole(value);
            setError("");
            try {
              const accepted = await onChange(value);
              if (accepted === false) setError("No se pudo cambiar el rol.");
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "No se pudo cambiar el rol.",
              );
            } finally {
              pending.current = false;
              setPendingRole(null);
            }
          }}
        />
      ) : role ? (
        <RoleBadge role={role} label={false} />
      ) : (
        <span
          className="room-role-empty"
          title="Sin rol elegido"
          aria-label="Sin rol elegido"
        >
          <UserRound size={14} aria-hidden />
        </span>
      )}
      {error && (
        <span role="status" className="room-role-error">
          {error}
        </span>
      )}
    </span>
  );
}

export function LobbyPlayer({
  player,
  captain,
  ready,
  selected,
  moves,
  onMove,
  onRoleChange,
  selfJoin,
  zone,
  pickable,
  onSelectAttempt,
  onKick,
  onReplaceCaptain,
  busy = false,
  selectionKind = "pick",
  pendingActions,
}: {
  player: RoomPlayer;
  captain?: boolean;
  ready?: boolean;
  action?: string;
  selected?: boolean;
  onAction?: () => void;
  onRoleChange?: (role: DotaRoleId) => Promise<void | boolean>;
  selfJoin?: boolean;
  invitationStatus?: Invitation["status"];
  onCancelInvite?: () => void;
  moves?: (Team | "bench")[];
  onMove?: (destination: Team | "bench") => void;
  zone?: Team | "bench";
  pickable?: boolean;
  onSelectAttempt?: () => void;
  onKick?: () => void;
  onReplaceCaptain?: () => void;
  busy?: boolean;
  selectionKind?: "pick" | "captain";
  pendingActions?: string[];
}) {
  const [confirmKick, setConfirmKick] = useState(false);
  return (
    <>
      <article
        data-lobby-player={player.id}
        data-lobby-zone={zone}
        className={`lobby-player player-card ${pickable ? "lobby-player-pickable" : ""} ${selected ? "lobby-player-selected" : ""} ${ready ? "player-card-ready" : ""}`}
      >
        {pickable && onSelectAttempt && (
          <button
            disabled={busy}
            className="player-selection-target"
            aria-label={`${selectionKind === "captain" ? "Elegir como capitán a" : "Elegir a"} ${player.name}`}
            aria-pressed={!!selected}
            onClick={onSelectAttempt}
          />
        )}
        <div className="player-card-content">
          <div className="lobby-player-header">
            <span className="player-card-link">
              <PlayerAvatar player={player} className="shrink-0 rounded-lg" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="lobby-player-name flex items-center gap-1 text-xs font-semibold">
                {ready && (
                  <Check
                    size={12}
                    className="shrink-0 text-emerald-300"
                    aria-label="Listo en Draftory"
                  />
                )}
                <span className="player-card-link lobby-player-name-link">
                  <PlayerName showLevel={false} player={player} />
                </span>
              </h3>
              <div className="lobby-player-status">
                <span
                  className="lobby-player-verification"
                  data-verified={
                    player.mmrAvailable !== false && player.mmrVerified === true
                  }
                  title={
                    player.mmrAvailable === false
                      ? "MMR pendiente de declarar"
                      : player.mmrVerified
                        ? "MMR verificado por Staff"
                        : "MMR declarado, pendiente de verificación"
                  }
                >
                  {player.mmrAvailable !== false && player.mmrVerified ? (
                    <ShieldCheck size={11} aria-hidden />
                  ) : (
                    <Clock3 size={11} aria-hidden />
                  )}
                  {player.mmrAvailable === false
                    ? "Sin MMR"
                    : player.mmrVerified
                      ? "Verificado"
                      : "Declarado"}
                </span>
                {player.online !== undefined && (
                  <span
                    title={
                      player.online
                        ? "Conectado a Draftory"
                        : "Sin conexión web; el intento conserva su roster"
                    }
                    aria-label={
                      player.online
                        ? "Conectado a Draftory"
                        : "Sin conexión a Draftory"
                    }
                    className={
                      player.online
                        ? "size-1.5 shrink-0 rounded-full bg-emerald-400"
                        : "size-1.5 shrink-0 rounded-full bg-zinc-600"
                    }
                  />
                )}
                {captain && (
                  <DashboardBadge
                    tone="captain"
                    className="player-captain-badge shrink-0"
                  >
                    <Crown size={10} />
                    Capitán
                  </DashboardBadge>
                )}
                {pickable && (
                  <span className="player-selection-hint">
                    {selectionKind === "captain" ? (
                      <>
                        <Crown size={11} />
                        Elegir capitán
                      </>
                    ) : (
                      "+ Elegir"
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="lobby-player-controls">
              <PlayerDotaMedal player={player} />
              <RoomRolePicker
                player={player}
                onChange={onRoleChange}
                disabled={busy}
              />
              <span className="player-card-link">
                <PlayerMenu
                  pendingActions={pendingActions}
                  onReplaceCaptain={onReplaceCaptain}
                  player={player}
                  moves={moves}
                  selfJoin={selfJoin}
                  onMove={onMove}
                  onKick={onKick ? () => setConfirmKick(true) : undefined}
                />
              </span>
            </div>
          </div>
          <dl className="lobby-player-stats">
            <div
              className="lobby-player-stat lobby-player-mmr"
              title={
                player.mmrFrozen
                  ? "Referencia del intento: MMR fijado al preparar la partida"
                  : player.mmrVerified
                    ? "MMR de Dota 2 verificado por Staff"
                    : "MMR de Dota 2 declarado por el jugador"
              }
            >
              <dt>
                MMR <span>Dota 2</span>
                {player.mmrFrozen && <small>Fijado</small>}
              </dt>
              <dd>
                {player.mmrAvailable === false ? (
                  <span className="lobby-player-stat-empty">Pendiente</span>
                ) : (
                  player.mmr.toLocaleString("es-ES")
                )}
              </dd>
            </div>
            <div className="lobby-player-stat lobby-player-elo">
              <dt>
                ELO <span>Draftory</span>
              </dt>
              <dd>
                {Number.isFinite(player.elo)
                  ? player.elo.toLocaleString("en-US")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </article>
      {confirmKick && onKick && (
        <DashboardDialog
          titleId={`kick-${player.id}`}
          onClose={() => setConfirmKick(false)}
        >
          <div className="dashboard-panel p-5">
            <h2 id={`kick-${player.id}`} className="dashboard-section-title">
              Expulsar jugador
            </h2>
            <p className="mt-4 text-sm text-zinc-400">
              ¿Quieres expulsar a {player.name} de esta sala?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <DashboardButton
                variant="ghost"
                onClick={() => setConfirmKick(false)}
              >
                Cancelar
              </DashboardButton>
              <DashboardButton
                variant="danger"
                onClick={() => {
                  onKick();
                  setConfirmKick(false);
                }}
              >
                Expulsar
              </DashboardButton>
            </div>
          </div>
        </DashboardDialog>
      )}
    </>
  );
}
