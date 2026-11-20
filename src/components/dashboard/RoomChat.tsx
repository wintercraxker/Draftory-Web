"use client";
import { AvatarImage } from "./AvatarIdentity";
import { DashboardButton } from "./DashboardUi";
import { Check, Send } from "lucide-react";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/rooms/engine";
import { roomConfig } from "@/lib/rooms/config";
import { ChatStaffLabel } from "../moderation/ChatStaffLabel";

// UI only: delivery and authentication belong to the injected transport.
export function RoomChat({
  messages,
  onSend,
  canSend,
  participants,
  pending = false,
  real = false,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  canSend: boolean;
  participants?: number;
  pending?: boolean;
  real?: boolean;
}) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [readingHistory, setReadingHistory] = useState(false);
  const latestId = messages.at(-1)?.id;
  const [readId, setReadId] = useState(latestId);
  useEffect(() => {
    if (log.current && follow.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [latestId, expanded]);
  function scrollToLatest() {
    follow.current = true;
    setReadingHistory(false);
    setReadId(latestId);
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }
  function trackScroll() {
    if (!log.current) return;
    follow.current =
      log.current.scrollHeight -
        log.current.scrollTop -
        log.current.clientHeight <
      64;
    setReadingHistory(!follow.current);
    if (follow.current) setReadId(latestId);
  }
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        document.querySelector<HTMLButtonElement>(".room-chat-toggle")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [expanded]);
  return (
    <aside
      className={`room-chat rounded-2xl border border-zinc-800 bg-[#0d0d0f] ${expanded ? "room-chat-expanded" : ""}`}
    >
      <div className="room-chat-heading border-b border-zinc-800 p-4">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="room-chat-toggle"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            Chat de sala
          </span>
          <span className="mt-1.5 block text-[10px] text-zinc-500">
            {participants !== undefined
              ? `${participants} participantes · `
              : ""}
            {pending
              ? "Pendiente de conectar"
              : real
                ? "Conectado"
                : "Demo local"}
          </span>
        </button>
      </div>
      <div
        ref={log}
        onScroll={trackScroll}
        role="log"
        aria-label="Mensajes de sala"
        aria-live="polite"
        className="room-chat-log scrollbar-hide space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <p className="text-xs text-zinc-600">
            Las conversaciones y eventos del lobby aparecerán aquí.
          </p>
        )}
        {messages.map((message, index) =>
          message.kind === "system" ? (
            <p
              key={message.id}
              className={`room-chat-system ${/equipos listos|equipos completos|obtiene el primer pick|partida finalizada|partida cancelada/i.test(message.text) ? "room-chat-important" : ""}`}
            >
              {/equipos listos|equipos completos|obtiene el primer pick|partida finalizada|partida cancelada/i.test(
                message.text,
              ) && <Check size={11} aria-hidden="true" />}
              {/^Inicio de partida observado en Dota 2\.?$/.test(
                message.text,
              ) ? (
                <span title={message.text}>
                  Evento histórico de Launch observado. No acredita por sí solo
                  el inicio del gameplay.
                </span>
              ) : (
                message.text
              )}
            </p>
          ) : (
            <div
              key={message.id}
              className={`room-chat-message flex items-start gap-2.5 ${messages[index - 1]?.kind === "user" && !!message.authorId && messages[index - 1]?.authorId === message.authorId && messages[index - 1]?.time === message.time ? "room-chat-grouped" : ""}`}
            >
              {!(
                messages[index - 1]?.kind === "user" &&
                !!message.authorId &&
                messages[index - 1]?.authorId === message.authorId &&
                messages[index - 1]?.time === message.time
              ) &&
                (message.authorId && message.author ? (
                  <PlayerAvatar
                    player={{
                      id: message.authorId,
                      name: message.author,
                      avatar: message.avatar,
                    }}
                    size={34}
                    className="room-chat-avatar rounded-lg"
                  />
                ) : message.avatar ? (
                  <AvatarImage
                    hoverReference="unavailable"
                    src={message.avatar}
                    size={34}
                    alt=""
                    className="room-chat-avatar shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    data-player-hover="unavailable"
                    className="grid room-chat-avatar shrink-0 place-items-center rounded-lg bg-zinc-800 text-xs"
                  >
                    {message.author?.[0]}
                  </span>
                ))}
              <div className="min-w-0 flex-1">
                {!(
                  messages[index - 1]?.kind === "user" &&
                  !!message.authorId &&
                  messages[index - 1]?.authorId === message.authorId &&
                  messages[index - 1]?.time === message.time
                ) && (
                  <p className="room-chat-author text-xs font-semibold">
                    <span className="room-chat-identity">
                      <ChatStaffLabel role={message.staffRole} />
                      {message.authorId && message.author ? (
                        <PlayerName
                          showLevel={false}
                          player={{
                            id: message.authorId,
                            name: message.author,
                          }}
                        />
                      ) : (
                        message.author
                      )}
                    </span>
                    <time className="room-chat-time">{message.time}</time>
                  </p>
                )}
                <p className="mt-1 break-words text-xs leading-5 text-zinc-300">
                  {message.text}
                </p>
              </div>
            </div>
          ),
        )}
      </div>
      {readingHistory && latestId !== readId && (
        <button className="room-chat-new-messages" onClick={scrollToLatest}>
          Mensajes nuevos · Bajar
        </button>
      )}
      <form
        className="room-chat-form flex gap-2 border-t border-zinc-800 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend && text.trim()) {
            follow.current = true;
            setReadingHistory(false);
            onSend(text);
            setText("");
          }
        }}
      >
        <input
          aria-label="Mensaje para la sala"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={roomConfig.messageMaxLength}
          disabled={!canSend}
          placeholder={
            pending
              ? "Chat pendiente de conectar"
              : canSend
                ? "Escribe a tu sala…"
                : "Entra a la sala para escribir"
          }
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs outline-none focus:border-violet-300/40"
        />
        <DashboardButton
          type="submit"
          variant="primary"
          size="icon"
          aria-label="Enviar mensaje"
          disabled={!canSend || !text.trim()}
        >
          <Send size={13} />
        </DashboardButton>
      </form>
    </aside>
  );
}
