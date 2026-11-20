import { randomUUID } from "node:crypto";
import type { Player } from "../competitive";
import type { MatchCompletion } from "../rooms/recognition";
import { getRecognitionStats } from "../rooms/recognition";
import { defaultProfile, type PlayerProfileData } from "../player-profiles";
import { getMedalFromMMR } from "../competitive";
import {
  pointsConfig,
  achievementDefinitions,
  type PointsEntry,
  type Achievement,
} from "./config";
import {
  calculateTeamStrength,
  calculateWinProbability,
  calculateOdds,
  type StrengthPlayer,
  type OddsQuote,
} from "./odds";
import { avatarConfig } from "../avatar";
import {
  getPreferredRole,
  getSecondaryRole,
  validatePreferredRoles,
} from "../dota-roles";

export type Prediction = {
  id: string;
  playerId: string;
  matchId: string;
  matchName: string;
  team: "radiant" | "dire";
  odds: number;
  amount: number;
  createdAt: number;
  status: "PENDING" | "WON" | "LOST" | "VOID";
  payout?: number;
  winningTeam?: "radiant" | "dire";
};
export type PredictionTarget = {
  id: string;
  name?: string;
  startedAt: number;
  participantIds: string[];
  finished: boolean;
  radiant?: StrengthPlayer[];
  dire?: StrengthPlayer[];
};
type Market = {
  probability: number;
  stakes: { radiant: number; dire: number };
  quote: OddsQuote;
};
type Account = {
  entries: PointsEntry[];
  unlocks: Record<string, number>;
  profile?: PlayerProfileData;
};
const shared = globalThis as typeof globalThis & {
  draftoryAccounts?: Map<string, Account>;
  draftoryAccountTokens?: Map<string, string>;
  draftoryPredictions?: Map<string, Prediction>;
  draftoryOfficialResults?: Map<string, MatchCompletion>;
};
const accounts = (shared.draftoryAccounts ??= new Map<string, Account>());
const tokens = (shared.draftoryAccountTokens ??= new Map<string, string>());
const predictions = (shared.draftoryPredictions ??= new Map<
  string,
  Prediction
>());
const results = (shared.draftoryOfficialResults ??= new Map<
  string,
  MatchCompletion
>());
const marketShared = globalThis as typeof globalThis & {
  draftoryOdds?: Map<string, Market>;
};
const markets = (marketShared.draftoryOdds ??= new Map<string, Market>());
const voidShared = globalThis as typeof globalThis & {
  draftoryVoidedPredictions?: Set<string>;
};
const voided = (voidShared.draftoryVoidedPredictions ??= new Set<string>());
export function voidMatchPredictions(matchId: string, now: number) {
  if (results.has(matchId))
    throw new Error("Una partida finalizada no puede anularse.");
  voided.add(matchId);
  for (const ticket of predictions.values())
    if (ticket.matchId === matchId && ticket.status === "PENDING") {
      ticket.status = "VOID";
      ticket.payout = ticket.amount;
      credit(ticket.playerId, {
        id: `prediction-refund:${ticket.id}`,
        type: "PREDICTION_REFUND",
        amount: ticket.amount,
        date: now,
        matchId,
      });
    }
}
export function getPredictionQuote(match: PredictionTarget) {
  let market = markets.get(match.id);
  if (!market) {
    const recent = (id: string) =>
      [...results.values()]
        .filter(
          (result) =>
            result.finishedAt < match.startedAt &&
            result.results.some(
              (player) => player.playerId === id && player.won !== undefined,
            ),
        )
        .sort((a, b) => a.finishedAt - b.finishedAt)
        .map(
          (result) =>
            result.results.find((player) => player.playerId === id)!.won!,
        );
    const probability = calculateWinProbability(
      calculateTeamStrength(match.radiant ?? [], recent),
      calculateTeamStrength(match.dire ?? [], recent),
    );
    market = {
      probability,
      stakes: { radiant: 0, dire: 0 },
      quote: calculateOdds(probability),
    };
    markets.set(match.id, market);
  }
  return { ...market.quote };
}
function account(id: string) {
  let value = accounts.get(id);
  if (!value) {
    value = { entries: [], unlocks: {} };
    accounts.set(id, value);
  }
  return value;
}
function balance(id: string) {
  return (
    pointsConfig.initial +
    account(id).entries.reduce((sum, entry) => sum + entry.amount, 0)
  );
}
function credit(id: string, entry: PointsEntry) {
  const value = account(id);
  if (!value.entries.some((existing) => existing.id === entry.id))
    value.entries.push(entry);
}

// Explicit demo identity provisioning. Production supplies an authenticated
// account/session instead. No request can provision an arbitrary player ID.
export function createAccountSession(existing?: string) {
  if (existing && tokens.has(existing))
    return {
      token: existing,
      player: readConfiguredProfile(tokens.get(existing)!) ?? defaultProfile,
    };
  const token = randomUUID();
  tokens.set(token, defaultProfile.id);
  account(defaultProfile.id);
  return {
    token,
    player: readConfiguredProfile(defaultProfile.id) ?? defaultProfile,
  };
}
export function authenticateAccount(token: string): Player {
  const id = tokens.get(token);
  if (!id) throw new Error("La sesión de cuenta no es válida.");
  return { ...(readConfiguredProfile(id) ?? defaultProfile), id };
}
export function readConfiguredProfile(id: string) {
  const profile = accounts.get(id)?.profile;
  if (!profile) return undefined;
  const {
    preferredRole,
    preferredRoles,
    position,
    secondaryPosition,
    ...rest
  } = profile as PlayerProfileData & {
    preferredRole?: unknown;
    preferredRoles?: unknown[];
    position?: string;
    secondaryPosition?: string;
  };
  void preferredRole;
  void preferredRoles;
  void position;
  void secondaryPosition;
  return structuredClone({
    ...rest,
    ...validatePreferredRoles(
      getPreferredRole(profile),
      getSecondaryRole(profile),
    ),
  });
}
export function configureAvatar(id: string, input: unknown) {
  if (
    typeof input !== "string" ||
    input.length > avatarConfig.maxStoredBytes * 1.4
  )
    throw new Error("Imagen demasiado grande.");
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) throw new Error("Formato de imagen no válido.");
  const data = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "png"
      ? data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? data[0] === 255 && data[1] === 216 && data[2] === 255
        : data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP";
  if (!valid || data.length > avatarConfig.maxStoredBytes)
    throw new Error("La imagen no es válida o supera el límite.");
  const profile = {
    ...(readConfiguredProfile(id) ?? defaultProfile),
    avatar: input,
  };
  account(id).profile = profile;
  return structuredClone(profile);
}
export function configureProfile(id: string, input: PlayerProfileData) {
  getMedalFromMMR(input.mmr);
  if (
    input.mmr > 30000 ||
    !input.name?.trim() ||
    input.name.length > 32 ||
    input.bio?.length > 240
  )
    throw new Error("Datos de perfil no válidos.");
  const current = readConfiguredProfile(id) ?? defaultProfile;
  const text = (value: unknown) => {
    if (typeof value !== "string" || value.length > 60)
      throw new Error("Datos de perfil no válidos.");
    return value.trim();
  };
  const roles = validatePreferredRoles(
    input.preferredRolePrimary,
    input.preferredRoleSecondary,
  );
  const profile = {
    ...current,
    ...roles,
    id,
    name: input.name.trim(),
    bio: input.bio?.trim() ?? "",
    country: text(input.country),
    region: text(input.region),
    visibility: text(input.visibility),
    mmr: input.mmr,
    dotaVisibility: ["private", "public", "unknown"].includes(
      input.dotaVisibility ?? "",
    )
      ? input.dotaVisibility
      : ("unknown" as const),
  };
  account(id).profile = profile;
  return structuredClone(profile);
}
export function getAchievements(
  id: string,
  matches = [...results.values()],
): Achievement[] {
  const own = matches
    .filter((match) =>
      match.results.some(
        (result) => result.playerId === id && result.won !== undefined,
      ),
    )
    .sort((a, b) => a.finishedAt - b.finishedAt);
  let streak = 0,
    bestStreak = 0;
  for (const match of own) {
    streak = match.results.find((result) => result.playerId === id)?.won
      ? streak + 1
      : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  const metrics = {
    played: own.length,
    wins: own.filter(
      (match) => match.results.find((result) => result.playerId === id)?.won,
    ).length,
    bestStreak,
    ...getRecognitionStats(id, matches),
    level: readConfiguredProfile(id)?.level ?? 1,
    elo: readConfiguredProfile(id)?.elo ?? 5000,
  };
  const value = account(id);
  return achievementDefinitions.map((definition) => {
    const progress = metrics[definition.metric];
    if (
      progress >= definition.target &&
      value.unlocks[definition.id] === undefined
    )
      value.unlocks[definition.id] = Math.max(
        ...matches.map((match) =>
          match.finalized ? match.voteEndsAt : match.finishedAt,
        ),
      );
    return {
      ...definition,
      progress: Math.min(definition.target, progress),
      unlockedAt: value.unlocks[definition.id],
    };
  });
}
export function recordMatchRewards(match: MatchCompletion) {
  if (voided.has(match.id)) return;
  results.set(match.id, structuredClone(match));
  for (const result of match.results)
    if (result.won !== undefined)
      credit(result.playerId, {
        id: `match:${match.id}:${result.playerId}`,
        type: result.won ? "VICTORY" : "DEFEAT",
        amount: result.won ? pointsConfig.victory : pointsConfig.defeat,
        date: match.finishedAt,
        matchId: match.id,
      });
  if (match.winningTeam)
    for (const prediction of predictions.values())
      if (prediction.matchId === match.id && prediction.status === "PENDING") {
        prediction.status =
          prediction.team === match.winningTeam ? "WON" : "LOST";
        prediction.winningTeam = match.winningTeam;
        prediction.payout =
          prediction.status === "WON"
            ? Math.floor(prediction.amount * prediction.odds)
            : 0;
        if (prediction.payout)
          credit(prediction.playerId, {
            id: `prediction-win:${prediction.id}`,
            type: "PREDICTION_WIN",
            amount: prediction.payout,
            date: match.finishedAt,
            matchId: match.id,
          });
      }
  for (const player of [...match.radiant, ...match.dire])
    getAchievements(player.id);
}
export function readAccount(id: string) {
  return {
    points: balance(id),
    entries: [...account(id).entries].reverse(),
    achievements: getAchievements(id),
    predictions: [...predictions.values()].filter(
      (prediction) => prediction.playerId === id,
    ),
  };
}
export function placePrediction(
  id: string,
  match: PredictionTarget,
  team: "radiant" | "dire",
  amount: number,
  now: number,
  expectedOdds?: number,
) {
  if (
    match.finished ||
    results.has(match.id) ||
    voided.has(match.id) ||
    now < match.startedAt ||
    now >= match.startedAt + pointsConfig.predictionDurationMs
  )
    throw new Error("Predicciones cerradas.");
  if (match.participantIds.includes(id))
    throw new Error(
      "Solo pueden predecir usuarios que no juegan esta partida.",
    );
  if (
    !["radiant", "dire"].includes(team) ||
    !Number.isSafeInteger(amount) ||
    amount < pointsConfig.minPrediction ||
    amount > balance(id)
  )
    throw new Error("Cantidad de puntos no válida o saldo insuficiente.");
  const key = `${match.id}:${id}`;
  if (predictions.has(key))
    throw new Error("Ya confirmaste tu predicción para esta partida.");
  const quote = getPredictionQuote(match),
    lockedOdds = quote[team];
  if (!Number.isFinite(lockedOdds) || lockedOdds <= 1)
    throw new Error("Cuota no disponible.");
  if (expectedOdds !== undefined && expectedOdds !== lockedOdds)
    throw new Error(
      "La cuota cambió. Revisa la cuota actual antes de confirmar.",
    );
  const prediction: Prediction = {
    id: key,
    playerId: id,
    matchId: match.id,
    matchName: match.name ?? match.id,
    team,
    odds: lockedOdds,
    amount,
    createdAt: now,
    status: "PENDING",
  };
  // No await between validation/debit/ticket: one atomic operation in this demo
  // process. A persistent adapter must use a database transaction + unique key.
  credit(id, {
    id: `prediction:${key}`,
    type: "PREDICTION_STAKE",
    amount: -amount,
    date: now,
    matchId: match.id,
  });
  predictions.set(key, prediction);
  const market = markets.get(match.id)!;
  market.stakes[team] += amount;
  market.quote = calculateOdds(market.probability, market.stakes, market.quote);
  return structuredClone(prediction);
}
