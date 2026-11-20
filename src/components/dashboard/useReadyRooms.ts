"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LobbyState } from "@/lib/rooms/engine";

import type { Room } from "@/lib/room-mock-data";
import type {
  ReadySession,
  ReadySnapshot,
  ReadyCommand,
} from "@/lib/rooms/ready-server";
import { activeRoomConflictCode } from "@/lib/rooms/ownership";

const storageKey = "draftory-demo-ready-sessions";
class RoomRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly room?: Room,
  ) {
    super(message);
  }
}
async function post<T>(body: object): Promise<T> {
  const response = await fetch("/api/demo/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new RoomRequestError(
      result.error ?? "No se pudo actualizar la sala.",
      result.code,
      result.room,
    );
  return result;
}

export function useReadyRooms(
  onSnapshot: (snapshot: ReadySnapshot) => void,
  onError: (message: string, unavailableRoomId?: string) => void,
  enabled = true,
) {
  const [sessions, setSessions] = useState<Record<string, ReadySession>>({});
  const sessionsRef = useRef(sessions);
  const versions = useRef<
    Record<string, { sessionId: string; revision: number; serverNow: number }>
  >({});
  const queues = useRef<Record<string, Promise<unknown>>>({});
  const starts = useRef<Record<string, Promise<void> | undefined>>({});
  const callbacks = useRef({ onSnapshot, onError });
  useEffect(() => {
    callbacks.current = { onSnapshot, onError };
  }, [onSnapshot, onError]);
  const receive = useCallback((snapshot: ReadySnapshot) => {
    const previous = versions.current[snapshot.room.id];
    if (
      previous?.sessionId === snapshot.sessionId &&
      (snapshot.revision < previous.revision ||
        (snapshot.revision === previous.revision &&
          snapshot.serverNow < previous.serverNow))
    )
      return;
    versions.current[snapshot.room.id] = {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      serverNow: snapshot.serverNow,
    };
    callbacks.current.onSnapshot(snapshot);
  }, []);
  function save(session: ReadySession) {
    const previous = sessionsRef.current[session.roomId];
    if (previous && JSON.stringify(previous) === JSON.stringify(session))
      return;
    const next = { ...sessionsRef.current, [session.roomId]: session };
    sessionsRef.current = next;
    setSessions(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const restore = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        const valid = Object.fromEntries(
          Object.entries(stored).filter(([, value]) => {
            const session = value as ReadySession;
            return (
              typeof session?.id === "string" &&
              typeof session.roomId === "string" &&
              session.tokens &&
              typeof session.tokens.self === "string"
            );
          }),
        ) as Record<string, ReadySession>;
        if (active) {
          sessionsRef.current = valid;
          setSessions(valid);
        }
      } catch {}
    };
    void restore();
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey) void restore();
    };
    window.addEventListener("storage", storage);
    return () => {
      active = false;
      window.removeEventListener("storage", storage);
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const streams = Object.values(sessions).map((session) => {
      const token = session.tokens.self;
      if (!token) return null;
      const stream = new EventSource(
        `/api/demo/rooms?id=${encodeURIComponent(session.id)}&token=${encodeURIComponent(token)}`,
      );
      stream.onmessage = (event) => {
        const snapshot: ReadySnapshot = JSON.parse(event.data);
        receive(snapshot);
        // Newly added demo identities get their own tokens from the service.
        if (
          snapshot.session &&
          JSON.stringify(snapshot.session) !==
            JSON.stringify(sessionsRef.current[session.roomId])
        ) {
          sessionsRef.current = {
            ...sessionsRef.current,
            [session.roomId]: snapshot.session,
          };
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify(sessionsRef.current),
            );
          } catch {}
        }
      };
      stream.onerror = () => {
        if (stream.readyState === EventSource.CLOSED) {
          if (sessionsRef.current[session.roomId]?.id !== session.id) return;
          const next = { ...sessionsRef.current };
          delete next[session.roomId];
          delete versions.current[session.roomId];
          sessionsRef.current = next;
          setSessions(next);
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          callbacks.current.onError(
            "La sesión demo ya no está disponible en el servidor. Crea otra sala para seguir probando.",
            session.roomId,
          );
        } else
          callbacks.current.onError(
            "Reconectando con la sala. Las confirmaciones y el plazo se conservan en el servidor.",
          );
      };
      return stream;
    });
    return () => streams.forEach((stream) => stream?.close());
  }, [sessions, receive, enabled]);
  return {
    adopt: (session: ReadySession, snapshot: ReadySnapshot) => {
      save(session);
      receive(snapshot);
    },
    createRoom: async (
      state: LobbyState,
      room: Room,
      accountToken: string,
      password?: string,
    ) => {
      try {
        const result = await post<{
          session: ReadySession;
          snapshot: ReadySnapshot;
        }>({ type: "createRoom", state, room, accountToken, password });
        save(result.session);
        receive(result.snapshot);
        return { room: result.snapshot.room, existing: false };
      } catch (error) {
        if (
          !(error instanceof RoomRequestError) ||
          error.code !== activeRoomConflictCode ||
          !error.room
        )
          throw error;
        // The account is authenticated again when recovering the existing room;
        // a conflict never returns room tokens or trusts the submitted creator.
        const result = await post<{
          session: ReadySession;
          snapshot: ReadySnapshot;
        }>({ type: "joinRoom", roomId: error.room.id, accountToken });
        save(result.session);
        receive(result.snapshot);
        return { room: result.snapshot.room, existing: true };
      }
    },
    joinRoom: async (
      roomId: string,
      accountToken: string,
      password?: string,
    ) => {
      const result = await post<{
        session: ReadySession;
        snapshot: ReadySnapshot;
      }>({ type: "joinRoom", roomId, accountToken, password });
      save(result.session);
      receive(result.snapshot);
      return result.snapshot.room;
    },
    hasSession: (roomId: string) => !!sessionsRef.current[roomId],
    start: async (state: LobbyState, room: Room, actorId: string) => {
      if (starts.current[room.id]) return starts.current[room.id];
      const task = (async () => {
        const ownerToken = sessionsRef.current[room.id]?.tokens[actorId];
        const result = await post<{
          session: ReadySession;
          snapshot: ReadySnapshot;
        }>({ type: "create", state, room, actorId, ownerToken });
        save(result.session);
        receive(result.snapshot);
      })();
      starts.current[room.id] = task;
      try {
        await task;
      } finally {
        delete starts.current[room.id];
      }
    },
    action: async (roomId: string, actor: string, action: ReadyCommand) => {
      const task = (queues.current[roomId] ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const session = sessionsRef.current[roomId];
          if (!session?.tokens[actor])
            throw new Error("No tienes una sesión válida para este jugador.");
          const snapshot = await post<ReadySnapshot>({
            id: session.id,
            token: session.tokens[actor],
            action,
          });
          if (snapshot.session) save(snapshot.session);
          receive(snapshot);
        });
      queues.current[roomId] = task;
      await task;
    },
  };
}
