"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Hand,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import {
  allPlayers,
  type Action,
  type LobbyState,
  type Team,
} from "@/lib/rooms/engine";
import type {
  MinigameSession,
  MinigameSnapshot,
  RpsMove,
} from "@/lib/rooms/minigame";
import { roomConfig, firstPickMethods } from "@/lib/rooms/config";
import { resolveClassicDiceTies } from "@/lib/rooms/minigame-rounds";

async function command<T>(body: object): Promise<T> {
  const response = await fetch("/api/demo/minigame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "No se pudo completar la ronda.");
  return data;
}
const moves = [
  { id: "rock", label: "Piedra", icon: ShieldCheck },
  { id: "paper", label: "Papel", icon: Hand },
  { id: "scissors", label: "Tijera", icon: Scissors },
] as const;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function RollingNumber() {
  const [value, setValue] = useState(roomConfig.rollMin);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    // Visual sequence only. It never supplies the competitive result.
    const timer = setInterval(
      () =>
        setValue(
          roomConfig.rollMin +
            ((++frame * 37) % (roomConfig.rollMax - roomConfig.rollMin + 1)),
        ),
      roomConfig.rollFrameMs,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      aria-label="Lanzando número"
      className="inline-flex min-w-16 justify-center text-4xl font-semibold tabular-nums text-violet-200"
      aria-live="off"
    >
      {value}
    </span>
  );
}

const diceFaces = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
function ClassicDie({
  value,
  rolling = false,
}: {
  value?: number;
  rolling?: boolean;
}) {
  const [face, setFace] = useState(1);
  useEffect(() => {
    if (
      !rolling ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let frame = 0;
    const timer = setInterval(
      () => setFace(1 + (++frame % roomConfig.diceMax)),
      100,
    );
    return () => clearInterval(timer);
  }, [rolling]);
  const Face = diceFaces[(rolling ? face : (value ?? 1)) - 1];
  return (
    <div className="flex items-center gap-2">
      <Face
        aria-label={
          rolling
            ? "Lanzando dado"
            : value
              ? `Dado: ${value}`
              : "Esperando dado"
        }
        className={`size-11 ${rolling ? "classic-die text-violet-200" : "text-zinc-300"}`}
      />
      {!rolling && value !== undefined && (
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      )}
    </div>
  );
}

export function CaptainMinigame({
  state,
  actor,
  onAction,
  clockNow = 0,
  realPlay,
}: {
  state: LobbyState;
  actor: string;
  onAction: (action: Action, actor: string) => void;
  clockNow?: number;
  realPlay?: (move?: RpsMove) => Promise<boolean>;
}) {
  const [session, setSession] = useState<MinigameSession | null>(null);
  const [snapshot, setSnapshot] = useState<MinigameSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingSide, setPlayingSide] = useState<Team | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const currentAction = useRef(onAction);
  const alive = useRef(true);
  const real = !!realPlay;
  useEffect(() => {
    currentAction.current = onAction;
  }, [onAction]);
  useEffect(() => {
    alive.current = true;
    if (real)
      return () => {
        alive.current = false;
      };
    const controller = new AbortController();
    command<MinigameSession>({ type: "create", game: state.game })
      .then((value) => {
        if (!controller.signal.aborted) setSession(value);
      })
      .catch((value) => {
        if (!controller.signal.aborted) setError(value.message);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [state.game, real]);
  const publicCountdown =
    state.minigameRevealAt !== undefined && !state.reveal
      ? Math.max(
          1,
          Math.ceil(
            (state.minigameRevealAt - clockNow) / (roomConfig.rpsRevealMs / 3),
          ),
        )
      : null;
  const side: Team | null =
    state.captains?.radiant === actor
      ? "radiant"
      : state.captains?.dire === actor
        ? "dire"
        : null;
  const players = allPlayers(state);
  const captainName = (team: Team) =>
    players.find((player) => player.id === state.captains?.[team])?.name ??
    team;
  const result =
    state.game === "rps"
      ? state.reveal
        ? { choices: state.reveal }
        : null
      : snapshot?.result;
  const tied = result?.dice
    ? result.dice.radiant === result.dice.dire
    : result?.choices
      ? result.choices.radiant === result.choices.dire
      : false;
  const revealedMove = (move: RpsMove) => {
    const item = moves.find((value) => value.id === move)!;
    return (
      <span className="lobby-player inline-flex items-center gap-2 text-sm font-semibold text-violet-200">
        <item.icon size={20} />
        {item.label}
      </span>
    );
  };

  async function play(move?: RpsMove) {
    if (realPlay) {
      if (!side || pending.current || state.phase !== "DECIDING_FIRST_PICK")
        return;
      pending.current = true;
      setBusy(true);
      setPlayingSide(side);
      try {
        await Promise.all([
          realPlay(move),
          pause(state.game === "rps" ? 150 : roomConfig.diceAnimationMs),
        ]);
      } finally {
        pending.current = false;
        if (alive.current) {
          setBusy(false);
          setPlayingSide(null);
        }
      }
      return;
    }
    if (
      !session ||
      !side ||
      pending.current ||
      state.phase !== "DECIDING_FIRST_PICK"
    )
      return;
    pending.current = true;
    setBusy(true);
    setPlayingSide(side);
    setError("");
    const playerActor = actor,
      playerSide = side;
    try {
      let activeSnapshot = snapshot;
      if (tied) {
        activeSnapshot = await command<MinigameSnapshot>({
          type: "nextRound",
          id: session.id,
          token: session.tokens[playerSide],
        });
        setSnapshot(activeSnapshot);
      }
      if (state.game !== "rps") {
        currentAction.current({ type: "beginRoll" }, playerActor);
        const [response] = await Promise.all([
          command<MinigameSnapshot>({
            type: "roll",
            id: session.id,
            token: session.tokens[playerSide],
          }),
          pause(roomConfig.diceAnimationMs),
        ]);
        if (!alive.current) return;
        setSnapshot(response);
        currentAction.current(
          { type: "roll", value: response.dice[playerSide]! },
          playerActor,
        );
        // Only the classic die repeats automatically. Each result still comes
        // from the server with a captain token; animation never supplies values.
        if (state.game === "dice")
          await resolveClassicDiceTies(
            response,
            async () => {
              await pause(350);
              if (!alive.current) throw new Error("Minijuego cerrado.");
              const reset = await command<MinigameSnapshot>({
                type: "nextRound",
                id: session.id,
                token: session.tokens[playerSide],
              });
              setSnapshot(reset);
              setPlayingSide(null);
              for (const team of ["radiant", "dire"] as const)
                currentAction.current(
                  { type: "beginRoll" },
                  state.captains![team],
                );
              const [responses] = await Promise.all([
                Promise.all(
                  (["radiant", "dire"] as const).map((team) =>
                    command<MinigameSnapshot>({
                      type: "roll",
                      id: session.id,
                      token: session.tokens[team],
                    }),
                  ),
                ),
                pause(roomConfig.diceAnimationMs),
              ]);
              if (!alive.current) throw new Error("Minijuego cerrado.");
              const round =
                responses.find((value) => value.result?.dice) ?? responses[1];
              setSnapshot(round);
              for (const team of ["radiant", "dire"] as const)
                currentAction.current(
                  { type: "roll", value: round.dice[team]! },
                  state.captains![team],
                );
              return round;
            },
            () => alive.current,
          );
      } else {
        currentAction.current({ type: "beginChoice" }, playerActor);
        const response = await command<MinigameSnapshot>({
          type: "choose",
          id: session.id,
          token: session.tokens[playerSide],
          move,
        });
        if (!alive.current) return;
        setSnapshot(response);
        currentAction.current({ type: "confirmChoice" }, playerActor);
        if (response.revealing) {
          for (const number of [3, 2, 1]) {
            setCountdown(number);
            await pause(roomConfig.rpsRevealMs / 3);
            if (!alive.current) return;
          }
          const revealed = await command<MinigameSnapshot>({
            type: "reveal",
            id: session.id,
            token: session.tokens[playerSide],
          });
          if (!alive.current) return;
          setCountdown(null);
          setSnapshot(revealed);
          const choices = revealed.result!.choices!;
          currentAction.current(
            {
              type: "revealRound",
              radiant: choices.radiant,
              dire: choices.dire,
            },
            playerActor,
          );
        }
      }
    } catch (value) {
      if (alive.current) {
        setCountdown(null);
        setError(
          value instanceof Error ? value.message : "Error de minijuego.",
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        setPlayingSide(null);
      }
    }
  }

  return (
    <section
      className="captain-minigame captain-minigame-inline"
      aria-label="Enfrentamiento por el primer pick"
    >
      <p className="sr-only">
        {firstPickMethods.find((method) => method.id === state.game)?.label}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
        {(["radiant", "dire"] as const).map((team, index) => (
          <div key={team} className="contents">
            {index === 1 && (
              <span className="text-xs font-semibold text-zinc-600">VS</span>
            )}
            <div
              className={`minigame-contender min-w-0 rounded-xl border p-2.5 text-center sm:p-4 ${side === team ? "border-violet-300/30 bg-violet-300/[0.03]" : "border-zinc-800"}`}
            >
              <p className="truncate text-sm font-semibold">
                {captainName(team)}
              </p>
              <p className="mt-1 text-[10px] uppercase text-zinc-600">{team}</p>
              <div className="mt-4 grid min-h-12 place-items-center">
                {state.game !== "rps" ? (
                  state.minigameRolling?.[team] ||
                  (busy &&
                    (playingSide === team || playingSide === null) &&
                    snapshot?.dice[team] === undefined) ? (
                    state.game === "dice" ? (
                      <ClassicDie rolling />
                    ) : (
                      <RollingNumber />
                    )
                  ) : state.game === "dice" ? (
                    <ClassicDie
                      value={state.dice[team] ?? snapshot?.dice[team]}
                    />
                  ) : (
                    <span
                      key={state.dice[team] ?? snapshot?.dice[team]}
                      className="lobby-player inline-flex min-w-16 justify-center text-4xl font-semibold tabular-nums text-zinc-200"
                    >
                      {state.dice[team] ?? snapshot?.dice[team] ?? "—"}
                    </span>
                  )
                ) : (countdown ?? publicCountdown) !== null ? (
                  <span
                    key={countdown ?? publicCountdown}
                    className="lobby-player text-3xl font-semibold text-violet-200"
                  >
                    {countdown ?? publicCountdown}
                  </span>
                ) : result?.choices ? (
                  revealedMove(result.choices[team])
                ) : (
                  <span className="text-xs text-zinc-500">
                    {state.choicesReady[team] || snapshot?.ready[team]
                      ? "✓ Listo"
                      : "Esperando…"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        hidden={!!state.first}
        className="mt-5 text-center"
        aria-live="polite"
      >
        {state.first ? (
          <p className="lobby-player text-sm text-violet-200">
            {captainName(state.first)} ganó · {state.first.toUpperCase()}{" "}
            obtiene el primer pick
          </p>
        ) : tied ? (
          <p className="text-sm text-zinc-300">
            {state.game === "dice"
              ? "Ronda empatada. Lanzando una nueva ronda automáticamente…"
              : `Ronda empatada. Jugar otra vez: ambos capitanes vuelven a ${state.game === "rps" ? "elegir" : "lanzar"}.`}
          </p>
        ) : (countdown ?? publicCountdown) !== null ? (
          <p className="text-xs text-violet-200">Revelando ambas elecciones…</p>
        ) : (
          <p className="text-xs text-zinc-500">
            {side
              ? snapshot?.ready[side]
                ? "Tu turno está confirmado. Esperando al rival."
                : `${captainName(side)}, ${state.game === "dice" ? "lanza tu dado" : state.game === "roll" ? "lanza tu número" : "elige tu jugada"}.`
              : "Los dos capitanes deciden quién selecciona primero."}
          </p>
        )}
      </div>
      {state.phase === "DECIDING_FIRST_PICK" && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {state.game !== "rps" ? (
            <button
              disabled={
                (!session && !realPlay) ||
                !side ||
                busy ||
                (realPlay
                  ? !!state.dice[side] || !!state.choicesReady[side]
                  : !tied && !!snapshot?.ready[side])
              }
              onClick={() => play()}
              className="rounded-xl border border-violet-300/25 bg-violet-300/5 px-5 py-2.5 text-xs text-violet-200 disabled:opacity-40"
            >
              {busy
                ? "Lanzando…"
                : state.game === "dice"
                  ? "Lanzar dado"
                  : "Lanzar número"}
            </button>
          ) : (
            moves.map((move) => (
              <button
                key={move.id}
                disabled={
                  (!session && !realPlay) ||
                  !side ||
                  busy ||
                  (realPlay
                    ? !!state.dice[side] || !!state.choicesReady[side]
                    : !tied && !!snapshot?.ready[side])
                }
                onClick={() => play(move.id)}
                className="flex min-w-24 flex-col items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-xs text-zinc-300 transition hover:border-violet-300/40 disabled:opacity-40"
              >
                <move.icon size={20} />
                {move.label}
              </button>
            ))
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}
