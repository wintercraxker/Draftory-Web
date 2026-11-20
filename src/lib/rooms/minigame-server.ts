import { randomInt, randomUUID } from "node:crypto";
import {
  roomConfig,
  firstPickMethods,
  getRollRange,
  type FirstPickGame,
} from "./config";
import type {
  CaptainSide,
  RpsMove,
  MinigameSnapshot,
  FirstPickResult,
} from "./minigame";

type Session = {
  game: FirstPickGame;
  tokens: Record<CaptainSide, string>;
  dice: Partial<Record<CaptainSide, number>>;
  choices: Partial<Record<CaptainSide, RpsMove>>;
  revealAt: number;
  result: FirstPickResult | null;
  expiresAt: number;
};
const globalStore = globalThis as typeof globalThis & {
  draftoryMinigames?: Map<string, Session>;
};
const sessions = (globalStore.draftoryMinigames ??= new Map<string, Session>());

// In-memory demo service. Real accounts replace demo tokens with authenticated
// captain sessions. Choices stay here, never in public lobby/client state.
export function createMinigame(game: FirstPickGame, now: number) {
  if (!firstPickMethods.some((method) => method.id === game))
    throw new Error("Método no disponible.");
  for (const [id, session] of sessions)
    if (session.expiresAt <= now) sessions.delete(id);
  if (sessions.size >= 1000) throw new Error("Demasiadas sesiones activas.");
  const id = randomUUID(),
    tokens = { radiant: randomUUID(), dire: randomUUID() };
  sessions.set(id, {
    game,
    tokens,
    dice: {},
    choices: {},
    revealAt: 0,
    result: null,
    expiresAt: now + 30 * 60_000,
  });
  return { id, tokens };
}
export function commandMinigame(
  id: string,
  token: string,
  command: "roll" | "choose" | "reveal" | "status" | "nextRound",
  move: RpsMove | undefined,
  now: number,
): MinigameSnapshot {
  const session = sessions.get(id);
  if (!session || session.expiresAt <= now)
    throw new Error("La sesión ha expirado.");
  const team: CaptainSide | null =
    token === session.tokens.radiant
      ? "radiant"
      : token === session.tokens.dire
        ? "dire"
        : null;
  if (!team) throw new Error("No tienes permiso para este capitán.");
  if (command === "nextRound") {
    const result = session.result;
    const tie = result?.dice
      ? result.dice.radiant === result.dice.dire
      : result?.choices
        ? result.choices.radiant === result.choices.dire
        : false;
    if (!tie) throw new Error("La ronda no terminó en empate.");
    session.dice = {};
    session.choices = {};
    session.revealAt = 0;
    session.result = null;
  } else if (command === "roll") {
    if (
      session.game === "rps" ||
      session.dice[team] !== undefined ||
      session.result
    )
      throw new Error("No puedes volver a lanzar.");
    const range = getRollRange(session.game);
    session.dice[team] = randomInt(range.min, range.max + 1);
    if (session.dice.radiant && session.dice.dire)
      session.result = {
        dice: { radiant: session.dice.radiant, dire: session.dice.dire },
      };
  } else if (command === "choose") {
    if (
      session.game !== "rps" ||
      session.choices[team] ||
      session.result ||
      !move ||
      !["rock", "paper", "scissors"].includes(move)
    )
      throw new Error("Elección no válida.");
    session.choices[team] = move;
    if (session.choices.radiant && session.choices.dire)
      session.revealAt = now + roomConfig.rpsRevealMs;
  } else if (command === "reveal") {
    if (session.game !== "rps" || !session.revealAt || now < session.revealAt)
      throw new Error("La revelación aún no está disponible.");
    session.result = {
      choices: {
        radiant: session.choices.radiant!,
        dire: session.choices.dire!,
      },
    };
  }
  return {
    ready: {
      radiant: !!(session.dice.radiant || session.choices.radiant),
      dire: !!(session.dice.dire || session.choices.dire),
    },
    dice: { ...session.dice },
    revealing: !!session.revealAt && !session.result,
    result: session.result,
  };
}
