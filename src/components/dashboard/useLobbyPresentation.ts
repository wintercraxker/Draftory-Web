"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LobbyState } from "@/lib/rooms/engine";
import { roomConfig } from "@/lib/rooms/config";

// Deadline-based presentation only: never advances a turn or restarts a clock.
export function useRoomClock(state: LobbyState, serverNow?: number) {
  const [now, setNow] = useState(0);
  const [sample, setSample] = useState<{ anchor: number; now: number } | null>(
    null,
  );
  const phase = state.phase,
    highlightExpires = state.highlight?.expiresAt,
    commendExpires =
      state.completion && !state.completion.finalized
        ? state.completion.voteEndsAt
        : undefined;
  useEffect(() => {
    if (serverNow !== undefined) {
      const received = Date.now();
      const tick = () =>
        setSample({
          anchor: serverNow,
          now: serverNow + Date.now() - received,
        });
      const timer = setInterval(tick, 200);
      return () => clearInterval(timer);
    }
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    if (
      phase !== "DRAFTING" &&
      phase !== "DECIDING_FIRST_PICK" &&
      !highlightExpires &&
      !commendExpires
    )
      return () => cancelAnimationFrame(frame);
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (
        phase !== "DRAFTING" &&
        phase !== "DECIDING_FIRST_PICK" &&
        (!highlightExpires || current >= highlightExpires) &&
        (!commendExpires || current >= commendExpires)
      )
        clearInterval(timer);
    }, 200);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [serverNow, phase, highlightExpires, commendExpires]);
  return serverNow !== undefined
    ? sample?.anchor === serverNow
      ? sample.now
      : serverNow
    : now !== 0
      ? now
      : (state.highlight?.createdAt ?? state.draftTurn?.startedAt ?? 0);
}

// FLIP across the real bank/team cards. No clones, extra avatars or animation library.
export function useLobbyPlayerMotion(state: LobbyState) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(
    new Map<string, { x: number; y: number; zone: string }>(),
  );
  useEffect(() => {
    const root = ref.current;
    const capture = () => {
      root
        ?.querySelectorAll<HTMLElement>("[data-lobby-player]")
        .forEach((element) => {
          const rect = element.getBoundingClientRect();
          previous.current.set(element.dataset.lobbyPlayer!, {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            zone: element.dataset.lobbyZone!,
          });
        });
    };
    // An internally scrolled bank must still be the actual animation origin.
    root?.addEventListener("scroll", capture, { capture: true, passive: true });
    window.addEventListener("resize", capture);
    return () => {
      root?.removeEventListener("scroll", capture, true);
      window.removeEventListener("resize", capture);
    };
  }, []);
  useLayoutEffect(() => {
    const positions = new Map<string, { x: number; y: number; zone: string }>();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    ref.current
      ?.querySelectorAll<HTMLElement>("[data-lobby-player]")
      .forEach((element) => {
        const rect = element.getBoundingClientRect();
        const id = element.dataset.lobbyPlayer!,
          zone = element.dataset.lobbyZone!;
        const position = {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          zone,
        };
        const old = previous.current.get(id);
        positions.set(id, position);
        if (
          !reduced &&
          old &&
          old.zone !== zone &&
          typeof element.animate === "function"
        )
          element.animate(
            [
              {
                transform: `translate(${old.x - position.x}px, ${old.y - position.y}px)`,
                opacity: 0.65,
              },
              { transform: "translate(0, 0)", opacity: 1 },
            ],
            {
              duration: roomConfig.playerMoveAnimationMs,
              easing: "cubic-bezier(.2,.7,.2,1)",
            },
          );
      });
    previous.current = positions;
  }, [state]);
  return ref;
}
