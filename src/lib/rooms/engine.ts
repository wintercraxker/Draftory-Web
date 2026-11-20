import { roomFormat } from "./lobby-options.mjs";
import { type Player } from "../competitive";
import {
  roomConfig,
  firstPickMethods,
  getRollRange,
  type FirstPickGame,
} from "./config";
import {
  createBalanceProposal,
  rosterSignature,
  type BalanceProposal,
} from "./balance";
import {
  finishLobbyMatch,
  commendPlayer,
  type MatchCompletion,
} from "./recognition";
import {
  getPreferredRole,
  validateRole,
  dotaRoles,
  type DotaRoleId,
} from "../dota-roles";

export type RoomPlayer = Player & {
  roomRole?: DotaRoleId | null;
  online?: boolean;
};
export function asRoomPlayer(player: Player): RoomPlayer {
  return { ...player, roomRole: getPreferredRole(player) };
}

export type Phase =
  | "WAITING"
  | "CHOOSING_CAPTAINS"
  | "DECIDING_FIRST_PICK"
  | "DRAFTING"
  | "READY"
  | "READY_CHECK"
  | "PREPARING"
  | "WAITING_FOR_PLAYERS"
  | "IN_GAME"
  | "FINISHED";
export type Formation = "automatic" | "captains";
export type Move = "rock" | "paper" | "scissors";
export type Team = "radiant" | "dire";
export type Invitation = {
  id: number;
  roomId: string;
  playerId: string;
  senderId: string;
  team: Team;
  status: "INVITED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  createdAt: number;
  expiresAt: number;
  purpose: "manual" | "draft" | "captain";
};
export type ChatMessage = {
  id: number;
  kind: "system" | "user";
  text: string;
  time: string;
  author?: string;
  authorId?: string;
  avatar?: string;
  staffRole?: import("../public-team").PublicTeamRole;
};
export type ReadyCheck = {
  status: "PENDING" | "PASSED" | "FAILED" | "CANCELLED";
  startedAt: number;
  expiresAt: number;
  completedAt?: number;
  readyPlayerIds: string[];
  players: { id: string; name: string; team: Team }[];
  reason?: string;
};
export type DotaLobby = {
  cancellationDiagnostic?: {
    reason: string;
    attempts: number;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    requiresIntervention?: boolean;
  };
  recoveryState?:
    | "AVAILABLE"
    | "LAUNCHING"
    | "IN_GAME"
    | "CANCELLATION_REQUESTED"
    | "LEAVING_LOBBY"
    | "RECOVERING"
    | "UNAVAILABLE_EXTERNAL_CONFLICT";
  progress?: { invitationsSent: number; expected: number };
  automationPhase?:
    | "SEARCHING_BOT"
    | "CANCELLING"
    | "FINALIZING"
    | "INTERVENTION"
    | "VERIFYING_ACCESS"
    | "VERIFYING_TEAMS";
  name?: string;
  region?: string;
  mode?: string;
  server?: string;
  password?: string;
  lobbyId?: string;
  sentAt?: number;
  connectedPlayerIds?: string[];
  invitedPlayerIds?: string[];
  productStatus?:
    | "PREPARING"
    | "INVITING"
    | "WAITING"
    | "RECONNECTING"
    | "PROBLEM"
    | "STARTING"
    | "STARTED";
  presenceFresh?: boolean;
  observedAt?: string;
  teamsConfirmed?: boolean;
  autoLaunchAuthorized?: boolean;
  playerEvidence?: {
    userId: string;
    observedTeam: "RADIANT" | "DIRE" | null;
    observedSlot?: number | null;
    previouslyPresent?: boolean;
    invitation:
      "PENDING" | "SENDING" | "SENT" | "PRESENT" | "FAILED" | "UNKNOWN";
  }[];
};
export type RoomHighlight = {
  id: number;
  kind: "first_pick" | "pick_confirmed" | "balanced" | "cancelled";
  actorId: string;
  playerId?: string;
  team?: Team;
  before?: number;
  after?: number;
  createdAt: number;
  expiresAt: number;
};
export type LobbyState = {
  mode?: string;
  hostId: string;
  phase: Phase;
  formation: Formation;
  game: FirstPickGame;
  radiant: RoomPlayer[];
  dire: RoomPlayer[];
  bench: RoomPlayer[];
  messages: ChatMessage[];
  captains: { radiant: string; dire: string } | null;
  first: Team | null;
  pick: number;
  dice: Partial<Record<Team, number>>;
  reveal: { radiant: Move; dire: Move } | null;
  invitations: Invitation[];
  roomId: string;
  choicesReady: Partial<Record<Team, boolean>>;
  balanceProposal: BalanceProposal | null;
  firstPickStarted?: boolean;
  firstPickSource?: "minigame" | "demo";
  minigameRolling?: Partial<Record<Team, boolean>>;
  minigameRevealAt?: number;
  readyCheck?: ReadyCheck;
  dotaLobby?: DotaLobby;
  draftTurn?: { startedAt: number; expiresAt: number };
  highlight?: RoomHighlight;
  attempt?: { id: string; number: number; startedAt: number };
  matchStartedAt?: number;
  cancelVote?: {
    attemptId: string;
    voterIds: string[];
    status: "OPEN" | "PASSED" | "CLOSED";
  };
  completion?: MatchCompletion;
  // Persisted orders survive configuration changes; production stops before bot integration.
  pickOrder?: readonly ("A" | "B")[];
  externalLobbyPending?: boolean;
  // A vote requests reconciliation after Launch; it does not end an external game.
  externalCancellationPending?: boolean;
  cancellationClosed?: boolean;
  continuation?: {
    id: string;
    state: string;
    reference: string;
    connected?: boolean;
    expiresAt: string | null;
    nextMatchId: string | null;
  } | null;
};
export type Action =
  | { type: "releaseContinuation" }
  | { type: "roomRole"; playerId: string; role: DotaRoleId }
  | { type: "kick"; playerId: string }
  | { type: "join"; player: Player }
  | { type: "configure"; formation: Formation; game: FirstPickGame }
  | { type: "setFirstPickGame"; game: FirstPickGame }
  | { type: "prepare" }
  | { type: "captain"; playerId: string }
  | { type: "proposeBalance" | "applyBalance" | "cancelBalance" }
  | { type: "beginRoll" | "beginChoice" }
  | { type: "confirmChoice" }
  | { type: "revealRound"; radiant: Move; dire: Move }
  | { type: "roll"; value: number }
  | { type: "pick"; playerId: string }
  | { type: "move"; playerId: string; destination: Team | "bench" }
  | { type: "invite"; playerId: string; team: Team }
  | { type: "replaceCaptain"; playerId: string; team: Team }
  | {
      type: "acceptInvite" | "declineInvite" | "cancelInvite";
      inviteId: number;
    }
  | { type: "expireInvites" }
  | { type: "start" }
  | { type: "finish"; winningTeam?: Team }
  | { type: "voteCancel"; attemptId: string }
  | { type: "commend"; matchId: string; playerId: string }
  | { type: "confirmReady" | "expireReadyCheck" | "leave" }
  | { type: "chat"; text: string };

export function createLobby(
  hostId: string,
  bench: Player[],
  formation: Formation = "automatic",
  roomId = "demo-room",
): LobbyState {
  bench = bench.map(asRoomPlayer);
  const host = bench.find((player) => player.id === hostId);
  return {
    hostId,
    roomId,
    bench:
      formation === "captains"
        ? bench.filter((player) => player.id !== hostId)
        : bench,
    formation,
    phase: "WAITING",
    game: "roll",
    radiant: formation === "captains" && host ? [host] : [],
    dire: [],
    messages: [],
    captains: null,
    first: null,
    pick: 0,
    dice: {},
    choicesReady: {},
    reveal: null,
    invitations: [],
    balanceProposal: null,
  };
}
export function allPlayers(state: LobbyState) {
  return [...state.radiant, ...state.dire, ...state.bench];
}
export function playerTeam(state: LobbyState, playerId: string): Team | null {
  return state.radiant.some((player) => player.id === playerId)
    ? "radiant"
    : state.dire.some((player) => player.id === playerId)
      ? "dire"
      : null;
}
export function allowedInvitationTeams(
  state: LobbyState,
  actorId: string,
): Team[] {
  const captain =
    actorId === state.captains?.radiant || actorId === state.captains?.dire;
  if (actorId !== state.hostId && !captain) return [];
  const side = playerTeam(state, actorId);
  return side ? [side] : actorId === state.hostId ? ["radiant", "dire"] : [];
}
export function canProposeBalance(state: LobbyState, actorId: string) {
  return (
    roomFormat(state.mode).playerDraft &&
    state.phase === "READY" &&
    state.radiant.length === roomFormat(state.mode).teamSize &&
    state.dire.length === roomFormat(state.mode).teamSize &&
    [...state.radiant, ...state.dire].every(
      (player) =>
        player.mmrAvailable !== false &&
        Number.isSafeInteger(player.mmr) &&
        player.mmr > 0,
    ) &&
    (actorId === state.hostId ||
      actorId === state.captains?.radiant ||
      actorId === state.captains?.dire)
  );
}
export function canVoteCancel(state: LobbyState, actorId: string) {
  return (
    roomFormat(state.mode).cancellationVotes !== null &&
    [
      "READY_CHECK",
      "READY",
      "PREPARING",
      "WAITING_FOR_PLAYERS",
      "IN_GAME",
    ].includes(state.phase) &&
    ["PENDING", "PASSED"].includes(state.readyCheck?.status ?? "") &&
    !!state.attempt &&
    !state.completion &&
    !state.cancellationClosed &&
    [...state.radiant, ...state.dire].some((player) => player.id === actorId)
  );
}
export function getStartBlockers(state: LobbyState): string[] {
  const reasons: string[] = [];
  if (state.externalCancellationPending)
    reasons.push(
      "Esperando la confirmación de salida del bot del intento anterior.",
    );
  for (const side of ["radiant", "dire"] as const) {
    const missing = roomFormat(state.mode).teamSize - state[side].length;
    if (missing > 0)
      reasons.push(
        `${side === "radiant" ? "Radiant" : "Dire"} necesita ${missing} ${missing === 1 ? "jugador más" : "jugadores más"}.`,
      );
    if (missing < 0)
      reasons.push("Cada equipo debe respetar la capacidad del modo.");
  }
  const confirmed = [...state.radiant, ...state.dire];
  if (
    new Set(allPlayers(state).map((player) => player.id)).size !==
    allPlayers(state).length
  )
    reasons.push("Hay jugadores duplicados en la sala.");
  if (roomFormat(state.mode).playerDraft && state.formation === "captains") {
    const captains = state.captains;
    if (
      !captains ||
      captains.radiant === captains.dire ||
      ![captains.radiant, captains.dire].every((id) =>
        confirmed.some((player) => player.id === id),
      )
    )
      reasons.push("Define los dos capitanes antes de iniciar.");
    if (!state.first) reasons.push("Completa la fase de primer pick.");
  }
  if (state.invitations.some((invite) => invite.status === "INVITED"))
    reasons.push("Resuelve las invitaciones pendientes.");
  if (state.balanceProposal)
    reasons.push("Aplica o cancela la propuesta de balance.");
  if (state.phase !== "READY")
    reasons.push("La sala todavía no está lista para iniciar.");
  return reasons;
}
export function currentPickTeam(state: LobbyState): Team | null {
  if (state.phase !== "DRAFTING" || !state.first) return null;
  const slot = (state.pickOrder ?? roomConfig.pickOrder)[state.pick];
  const preferred =
    slot === "A"
      ? state.first
      : slot === "B"
        ? state.first === "radiant"
          ? "dire"
          : "radiant"
        : state.first;
  if (state[preferred].length < roomFormat(state.mode).teamSize)
    return preferred;
  const other = preferred === "radiant" ? "dire" : "radiant";
  return state[other].length < roomFormat(state.mode).teamSize ? other : null;
}
export function rpsWinner(a: Move, b: Move): Team | null {
  if (a === b) return null;
  return (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
    ? "radiant"
    : "dire";
}
// Reuse on the server with an authenticated actorId, server time and trusted dice.
// Invalid actions throw before mutation. Clients cannot authorize themselves.
export function transitionLobby(
  state: LobbyState,
  action: Action,
  actorId: string,
  time: string,
  now = 0,
): LobbyState {
  const next: LobbyState = {
    ...state,
    radiant: [...state.radiant],
    dire: [...state.dire],
    bench: [...state.bench],
    messages: [...state.messages],
    dice: { ...state.dice },
    choicesReady: { ...state.choicesReady },
    invitations: state.invitations.map((invite) => ({
      ...invite,
      status:
        invite.status === "INVITED" && invite.expiresAt <= now
          ? "EXPIRED"
          : invite.status,
    })),
  };
  const actor = allPlayers(state).find((player) => player.id === actorId);
  const requireHost = () => {
    if (actorId !== state.hostId)
      throw new Error("Solo el creador puede realizar esta acción.");
  };
  const requirePhase = (...phases: Phase[]) => {
    if (!phases.includes(state.phase))
      throw new Error("Acción no disponible en esta fase.");
  };
  const system = (text: string) =>
    next.messages.push({
      id: next.messages.length,
      kind: "system",
      text,
      time,
    });
  const captainTeam =
    state.captains?.radiant === actorId
      ? "radiant"
      : state.captains?.dire === actorId
        ? "dire"
        : null;
  const highlight = (
    data: Omit<RoomHighlight, "id" | "createdAt" | "expiresAt">,
  ) => {
    next.highlight = {
      ...data,
      id: next.messages.length,
      createdAt: now,
      expiresAt: now + roomConfig.statusHighlightMs,
    };
  };
  const resetDraftTurn = (delay = 0) => {
    next.draftTurn = {
      startedAt: now + delay,
      expiresAt: now + delay + roomConfig.draftTurnDurationMs,
    };
  };
  if (
    state.phase === "DRAFTING" &&
    state.invitations.some(
      (invite) =>
        invite.purpose === "draft" &&
        invite.status === "INVITED" &&
        invite.expiresAt <= now,
    )
  )
    resetDraftTurn();
  const startDraft = (winner: Team) => {
    next.first = winner;
    next.firstPickSource = "minigame";
    next.phase = "DRAFTING";
    const captainId = state.captains![winner];
    highlight({ kind: "first_pick", actorId: captainId, team: winner });
    resetDraftTurn(roomConfig.statusHighlightMs);
    system(
      `${allPlayers(state).find((player) => player.id === captainId)?.name ?? winner} ganó ${firstPickMethods.find((method) => method.id === state.game)?.label}.`,
    );
    system(
      `${winner === "radiant" ? "Radiant" : "Dire"} obtiene el primer pick.`,
    );
  };
  if (action.type === "join") {
    if (
      actorId !== action.player.id ||
      allPlayers(state).some((p) => p.id === actorId)
    )
      throw new Error("Participante inválido o duplicado.");
    next.bench.push(asRoomPlayer(action.player));
    system(`${action.player.name} entró a la sala.`);
    return next;
  }
  if (!actor) throw new Error("Debes pertenecer a la sala.");
  switch (action.type) {
    case "roomRole": {
      if (actorId !== action.playerId)
        throw new Error("Solo puedes cambiar tu propio rol de sala.");
      if (
        state.matchStartedAt !== undefined ||
        ["IN_GAME", "FINISHED"].includes(state.phase)
      )
        throw new Error(
          "El rol no puede cambiar después del inicio de la partida.",
        );
      const role = validateRole(action.role);
      for (const zone of ["radiant", "dire", "bench"] as const)
        next[zone] = next[zone].map((player) =>
          player.id === actorId ? { ...player, roomRole: role } : player,
        );
      if ((actor as RoomPlayer).roomRole !== role)
        system(
          `${actor.name} eligió ${dotaRoles.find((item) => item.id === role)!.name} para esta sala.`,
        );
      break;
    }
    case "proposeBalance": {
      if (!canProposeBalance(state, actorId))
        throw new Error(
          "Solo el creador o un capitán puede proponer un balance con equipos completos.",
        );
      if (state.balanceProposal)
        throw new Error("Resuelve primero la propuesta pendiente.");
      next.balanceProposal = createBalanceProposal(
        state.radiant,
        state.dire,
        actorId,
        state.captains,
      );
      break;
    }
    case "cancelBalance": {
      if (
        !state.balanceProposal ||
        (actorId !== state.hostId &&
          actorId !== state.balanceProposal.proposedBy)
      )
        throw new Error("No puedes cancelar esta propuesta.");
      next.balanceProposal = null;
      break;
    }
    case "applyBalance": {
      requireHost();
      requirePhase("READY");
      const proposal = state.balanceProposal;
      if (
        !proposal ||
        proposal.source !== rosterSignature(state.radiant, state.dire)
      )
        throw new Error(
          "Los equipos han cambiado. Calcula una nueva propuesta.",
        );
      // Recompute from the current confirmed roster; never trust submitted teams.
      const trusted = createBalanceProposal(
        state.radiant,
        state.dire,
        actorId,
        state.captains,
      );
      const confirmed = [...state.radiant, ...state.dire];
      next.radiant = trusted.radiantIds.map((id) =>
        confirmed.find((player) => player.id === id)!,
      );
      next.dire = trusted.direIds.map((id) =>
        confirmed.find((player) => player.id === id)!,
      );
      next.balanceProposal = null;
      highlight({
        kind: "balanced",
        actorId,
        before: trusted.before.totalDifference,
        after: trusted.after.totalDifference,
      });
      system(`${actor.name} aplicó un balance de equipos.`);
      system(
        `Diferencia de MMR total: ${trusted.before.totalDifference.toLocaleString("en-US")} → ${trusted.after.totalDifference.toLocaleString("en-US")}.`,
      );
      break;
    }
    case "beginRoll":
      requirePhase("DECIDING_FIRST_PICK");
      if (!captainTeam || state.game === "rps" || state.dice[captainTeam])
        throw new Error("No puedes lanzar este dado.");
      next.firstPickStarted = true;
      next.minigameRolling = { ...state.minigameRolling, [captainTeam]: true };
      system(
        state.game === "dice"
          ? `${actor.name} lanzó el dado.`
          : `${actor.name} inició su lanzamiento.`,
      );
      break;
    case "beginChoice":
      requirePhase("DECIDING_FIRST_PICK");
      if (
        !captainTeam ||
        state.game !== "rps" ||
        state.choicesReady[captainTeam]
      )
        throw new Error("No puedes elegir en esta ronda.");
      next.firstPickStarted = true;
      next.reveal = null;
      break;
    case "confirmChoice":
      requirePhase("DECIDING_FIRST_PICK");
      if (
        !captainTeam ||
        state.game !== "rps" ||
        state.choicesReady[captainTeam]
      )
        throw new Error("Elección ya confirmada.");
      next.firstPickStarted = true;
      next.choicesReady[captainTeam] = true;
      system(`${actor.name} está listo.`);
      if (next.choicesReady.radiant && next.choicesReady.dire) {
        next.minigameRevealAt = now + roomConfig.rpsRevealMs;
        system("Revelando elecciones…");
      }
      break;
    case "revealRound": {
      requirePhase("DECIDING_FIRST_PICK");
      if (
        !captainTeam ||
        state.game !== "rps" ||
        !state.choicesReady.radiant ||
        !state.choicesReady.dire ||
        ![action.radiant, action.dire].every((move) =>
          ["rock", "paper", "scissors"].includes(move),
        )
      )
        throw new Error("Revelación no disponible.");
      next.reveal = { radiant: action.radiant, dire: action.dire };
      next.minigameRevealAt = undefined;
      const labels = { rock: "Piedra", paper: "Papel", scissors: "Tijera" };
      system(
        `${state.radiant[0]?.name}: ${labels[action.radiant]}. ${state.dire[0]?.name}: ${labels[action.dire]}.`,
      );
      const winner = rpsWinner(action.radiant, action.dire);
      if (winner) startDraft(winner);
      else {
        next.choicesReady = {};
        system("Empate. Ambos capitanes vuelven a elegir.");
      }
      break;
    }
    case "expireInvites":
      break;
    case "invite":
    case "acceptInvite":
    case "declineInvite":
    case "cancelInvite":
      throw new Error(
        "Las asignaciones son directas; las invitaciones ya no están disponibles.",
      );
    case "configure":
      if (
        !roomFormat(state.mode).playerDraft &&
        action.formation !== "automatic"
      )
        throw new Error("Solo Mid no utiliza draft de jugadores.");
      requireHost();
      requirePhase("WAITING");
      if (next.invitations.some((invite) => invite.status === "INVITED"))
        throw new Error(
          "Resuelve las invitaciones pendientes antes de configurar.",
        );
      if (
        !["automatic", "captains"].includes(action.formation) ||
        !firstPickMethods.some((method) => method.id === action.game)
      )
        throw new Error("Configuración inválida.");
      next.formation = action.formation;
      next.game = action.game;
      break;
    case "setFirstPickGame": {
      requireHost();
      requirePhase("DECIDING_FIRST_PICK");
      if (
        state.firstPickStarted ||
        Object.keys(state.dice).length ||
        Object.keys(state.choicesReady).length
      )
        throw new Error("El minijuego ya comenzó.");
      if (!firstPickMethods.some((method) => method.id === action.game))
        throw new Error("Método inválido.");
      next.game = action.game;
      break;
    }
    case "prepare": {
      if (!roomFormat(state.mode).playerDraft)
        throw new Error("Solo Mid no utiliza capitanes ni draft.");
      requireHost();
      requirePhase("WAITING");
      if (state.captains)
        throw new Error("Los dos capitanes ya están asignados.");
      if (next.invitations.some((invite) => invite.status === "INVITED"))
        throw new Error("Resuelve las invitaciones antes de iniciar el draft.");
      if (allPlayers(state).length < 2)
        throw new Error("Espera a que otro jugador entre al banco.");
      if (state.formation !== "captains")
        throw new Error("Esta sala usa asignación directa.");
      const host = allPlayers(state).find(
        (player) => player.id === state.hostId,
      )!;
      const hostSide = playerTeam(state, state.hostId) ?? "radiant";
      next.bench = allPlayers(state).filter(
        (player) => player.id !== state.hostId,
      );
      next.radiant = [];
      next.dire = [];
      next[hostSide] = [host];
      next.captains = null;
      next.first = null;
      next.pick = 0;
      next.dice = {};
      next.choicesReady = {};
      next.reveal = null;
      next.balanceProposal = null;
      next.firstPickStarted = false;
      next.firstPickSource = undefined;
      next.highlight = undefined;
      next.draftTurn = undefined;
      next.minigameRolling = undefined;
      next.minigameRevealAt = undefined;
      next.phase = "CHOOSING_CAPTAINS";
      system("El creador selecciona al segundo capitán.");
      break;
    }
    case "captain": {
      requireHost();
      requirePhase("CHOOSING_CAPTAINS");
      const second = state.bench.find(
        (p) =>
          p.id === action.playerId &&
          p.id !== state.hostId &&
          p.id !== state.captains?.radiant &&
          p.id !== state.captains?.dire,
      );
      if (!second) throw new Error("Selecciona otro jugador disponible.");
      const hostSide = playerTeam(state, state.hostId);
      if (!hostSide) throw new Error("El creador debe ocupar su equipo.");
      const rival = hostSide === "dire" ? "radiant" : "dire";
      next.bench = next.bench.filter((player) => player.id !== second.id);
      next[rival].push(second);
      next.captains =
        hostSide === "radiant"
          ? { radiant: state.hostId, dire: second.id }
          : { radiant: second.id, dire: state.hostId };
      next.invitations = [];
      next.phase = "DECIDING_FIRST_PICK";
      system(
        `${actor.name} designó a ${second.name} como capitán de ${rival === "radiant" ? "Radiant" : "Dire"}.`,
      );
      break;
    }
    case "move": {
      requirePhase("WAITING", "READY", "DRAFTING");
      if (
        actorId !== state.hostId &&
        (!captainTeam || action.destination !== captainTeam)
      )
        throw new Error(
          "Solo el creador o el capitán de este equipo puede asignar jugadores.",
        );
      if (state.phase === "DRAFTING" && action.destination !== "bench")
        throw new Error("Durante el draft utiliza un pick.");
      if (!["radiant", "dire", "bench"].includes(action.destination))
        throw new Error("Destino inválido.");
      const source = (["radiant", "dire", "bench"] as const).find((zone) =>
        state[zone].some((p) => p.id === action.playerId),
      );
      if (!source || source === action.destination)
        throw new Error("Movimiento inválido.");
      if (
        state.captains &&
        [state.captains.radiant, state.captains.dire].includes(action.playerId)
      )
        throw new Error("Los capitanes conservan su plaza durante este draft.");
      if (
        action.destination !== "bench" &&
        state[action.destination].length >= roomFormat(state.mode).teamSize
      )
        throw new Error("El equipo ya esta completo.");
      const player = state[source].find((p) => p.id === action.playerId)!;
      if (
        next.invitations.some(
          (invite) =>
            invite.playerId === player.id && invite.status === "INVITED",
        )
      )
        throw new Error("Resuelve primero la invitación del jugador.");
      if (
        action.destination !== "bench" &&
        next[action.destination].length +
          next.invitations.filter(
            (invite) =>
              invite.team === action.destination && invite.status === "INVITED",
          ).length >=
          roomFormat(state.mode).teamSize
      )
        throw new Error("Las plazas están ocupadas o reservadas.");
      if (action.destination !== "bench" && player.id !== actorId) {
        if (source !== "bench")
          throw new Error("Devuelve primero al jugador al banco.");
        if (
          !allowedInvitationTeams(state, actorId).includes(action.destination)
        )
          throw new Error("Solo puedes subir jugadores a tu equipo.");
      }
      next.balanceProposal = null;
      next[source] = next[source].filter((p) => p.id !== action.playerId);
      next[action.destination].push(player);
      if (player.id === actorId && action.destination !== "bench") {
        for (const invite of next.invitations) {
          if (
            invite.senderId === actorId &&
            invite.status === "INVITED" &&
            invite.team !== action.destination
          ) {
            invite.status = "CANCELLED";
            system(
              `${actor.name} canceló una invitación al cambiar de equipo.`,
            );
          }
        }
      }
      next.phase =
        next.radiant.length === roomFormat(state.mode).teamSize &&
        next.dire.length === roomFormat(state.mode).teamSize
          ? "READY"
          : state.captains && state.first
            ? "DRAFTING"
            : "WAITING";
      if (next.phase === "DRAFTING") resetDraftTurn();
      system(
        action.destination === "bench"
          ? `${player.name} volvió al banco.`
          : `${actor.name} subió a ${player.name} a ${action.destination === "radiant" ? "Radiant" : "Dire"}.`,
      );
      break;
    }
    case "replaceCaptain": {
      requireHost();
      requirePhase(
        "WAITING",
        "CHOOSING_CAPTAINS",
        "DECIDING_FIRST_PICK",
        "DRAFTING",
        "READY",
      );
      if (!state.captains || !["radiant", "dire"].includes(action.team))
        throw new Error("No hay capitán para reemplazar.");
      const oldId = state.captains[action.team];
      if (oldId === state.hostId)
        throw new Error("El creador conserva su puesto de capitán.");
      const replacement = state.bench.find(
        (player) => player.id === action.playerId,
      );
      const oldCaptain = state[action.team].find(
        (player) => player.id === oldId,
      );
      if (!replacement || !oldCaptain)
        throw new Error("Selecciona un reemplazo disponible en el banco.");
      next[action.team] = state[action.team].map((player) =>
        player.id === oldId ? replacement : player,
      );
      next.bench = [
        ...state.bench.filter((player) => player.id !== replacement.id),
        oldCaptain,
      ];
      next.captains = { ...state.captains, [action.team]: replacement.id };
      next.balanceProposal = null;
      next.highlight = undefined;
      if (!state.first) {
        next.dice = {};
        next.choicesReady = {};
        next.reveal = null;
        next.firstPickStarted = false;
        next.minigameRolling = undefined;
        next.minigameRevealAt = undefined;
        next.phase = "DECIDING_FIRST_PICK";
      }
      system(
        `${actor.name} designó a ${replacement.name} como capitán de ${action.team === "radiant" ? "Radiant" : "Dire"}. ${oldCaptain.name} volvió al banco.`,
      );
      break;
    }
    case "roll": {
      requirePhase("DECIDING_FIRST_PICK");
      if (!captainTeam || state.game === "rps" || state.dice[captainTeam])
        throw new Error("Lanzamiento no permitido.");
      const range = getRollRange(state.game);
      if (
        !Number.isInteger(action.value) ||
        action.value < range.min ||
        action.value > range.max
      )
        throw new Error("Lanzamiento inválido.");
      next.minigameRolling = { ...state.minigameRolling, [captainTeam]: false };
      next.dice[captainTeam] = action.value;
      system(`${actor.name} obtuvo ${action.value}.`);
      if (next.dice.radiant && next.dice.dire) {
        if (next.dice.radiant === next.dice.dire) {
          system(`Ambos obtuvieron ${action.value}.`);
          next.dice = {};
          system(
            state.game === "dice"
              ? "Empate. Nueva ronda de dados."
              : "Empate. Los capitanes deben volver a lanzar.",
          );
        } else {
          const winner =
            next.dice.radiant > next.dice.dire ? "radiant" : "dire";
          if (state.game === "dice")
            system(
              `${allPlayers(state).find((player) => player.id === state.captains?.[winner])?.name} ganó con ${next.dice[winner]} contra ${next.dice[winner === "radiant" ? "dire" : "radiant"]}.`,
            );
          startDraft(winner);
        }
      }
      break;
    }
    case "pick": {
      requirePhase("DRAFTING");
      const team = currentPickTeam(state);
      if (!team || captainTeam !== team) throw new Error("No es tu turno.");
      const player = state.bench.find((p) => p.id === action.playerId);
      if (
        !player ||
        next[team].length >= roomFormat(state.mode).teamSize ||
        next.invitations.some(
          (invite) =>
            invite.playerId === player.id && invite.status === "INVITED",
        )
      )
        throw new Error("Selección inválida.");
      next.bench = next.bench.filter((p) => p.id !== player.id);
      next[team].push(player);
      next.pick++;
      highlight({ kind: "pick_confirmed", actorId, playerId: player.id, team });
      resetDraftTurn(roomConfig.statusHighlightMs);
      system(
        `${actor.name} eligió a ${player.name} para ${team === "radiant" ? "Radiant" : "Dire"}.`,
      );
      if (
        next.radiant.length === roomFormat(state.mode).teamSize &&
        next.dire.length === roomFormat(state.mode).teamSize
      ) {
        next.phase = "READY";
        next.draftTurn = undefined;
        system("Equipos listos.");
      }
      break;
    }
    case "start": {
      requireHost();
      const reasons = getStartBlockers(next);
      if (reasons.length) throw new Error(reasons.join(" "));
      next.phase = "READY_CHECK";
      next.dotaLobby = undefined;
      next.matchStartedAt = undefined;
      next.cancelVote = undefined;
      next.completion = undefined;
      const attemptNumber = (state.attempt?.number ?? 0) + 1;
      next.attempt = {
        id: `${state.roomId}:${attemptNumber}`,
        number: attemptNumber,
        startedAt: now,
      };
      next.highlight = undefined;
      next.draftTurn = undefined;
      next.readyCheck = {
        status: "PENDING",
        startedAt: now,
        expiresAt: now + roomConfig.readyCheckDurationMs,
        readyPlayerIds: [],
        players: (["radiant", "dire"] as const).flatMap((team) =>
          next[team].map((player) => ({
            id: player.id,
            name: player.name,
            team,
          })),
        ),
      };
      system(
        "Partida lista. Todos los participantes deben confirmar que están listos.",
      );
      break;
    }
    case "voteCancel": {
      if (
        !canVoteCancel(state, actorId) ||
        action.attemptId !== state.attempt!.id
      )
        throw new Error(
          "La solicitud de cancelación está reservada a los participantes de este intento vigente.",
        );
      const vote =
        state.cancelVote?.attemptId === action.attemptId
          ? state.cancelVote
          : {
              attemptId: action.attemptId,
              voterIds: [],
              status: "OPEN" as const,
            };
      if (vote.status === "PASSED" && state.externalCancellationPending) break;
      if (vote.status !== "OPEN") throw new Error("Esta votación ya terminó.");
      if (vote.voterIds.includes(actorId)) break;
      next.cancelVote = { ...vote, voterIds: [...vote.voterIds, actorId] };
      system(
        `${actor.name} votó para cancelar el intento (${next.cancelVote.voterIds.length}/${roomFormat(state.mode).cancellationVotes ?? Infinity}).`,
      );
      if (
        next.cancelVote.voterIds.length >=
        (roomFormat(state.mode).cancellationVotes ?? Infinity)
      ) {
        next.cancelVote.status = "PASSED";
        if (
          state.externalCancellationPending ||
          state.phase === "IN_GAME" ||
          ["STARTING", "STARTED"].includes(state.dotaLobby?.productStatus ?? "")
        ) {
          system(
            "Cancelación aprobada por los jugadores. El bot procesará la salida de Dota 2 y conservará su reserva hasta confirmar que ha abandonado el lobby.",
          );
          break;
        }
        next.phase = "READY";
        next.dotaLobby = undefined;
        next.matchStartedAt = undefined;
        next.readyCheck = undefined;
        next.draftTurn = undefined;
        highlight({ kind: "cancelled", actorId });
        system(
          "Partida cancelada por votación. Se conservan equipos, capitanes y picks. Pueden volver a iniciar.",
        );
      }
      break;
    }
    case "commend": {
      requirePhase("FINISHED");
      if (!state.completion || action.matchId !== state.completion.id)
        throw new Error("La partida no coincide.");
      next.completion = commendPlayer(
        state.completion,
        actorId,
        action.playerId,
        now,
      );
      break;
    }
    case "confirmReady": {
      requirePhase("READY_CHECK");
      const check = state.readyCheck;
      if (
        !check ||
        check.status !== "PENDING" ||
        !check.players.some((player) => player.id === actorId)
      )
        throw new Error(
          "Solo pueden confirmar los participantes seleccionados.",
        );
      if (now >= check.expiresAt) {
        next.readyCheck = {
          ...check,
          status: "FAILED",
          completedAt: now,
          reason: "El Ready Check expiró porque no todos confirmaron.",
        };
        next.phase = "READY";
        system(
          "El Ready Check expiró porque no todos confirmaron. El creador puede iniciar la partida nuevamente.",
        );
        break;
      }
      if (check.readyPlayerIds.includes(actorId)) break;
      next.readyCheck = {
        ...check,
        readyPlayerIds: [...check.readyPlayerIds, actorId],
        expiresAt: now + roomConfig.readyCheckDurationMs,
      };
      system(`${actor.name} está listo.`);
      if (next.readyCheck.readyPlayerIds.length === check.players.length) {
        next.readyCheck.status = "PASSED";
        next.readyCheck.completedAt = now;
        next.phase = "PREPARING";
        system("Todos listos. Preparando la lobby de Dota.");
      }
      break;
    }
    case "expireReadyCheck": {
      if (
        state.phase !== "READY_CHECK" ||
        !state.readyCheck ||
        now < state.readyCheck.expiresAt
      )
        break;
      next.readyCheck = {
        ...state.readyCheck,
        status: "FAILED",
        completedAt: now,
        reason: "El Ready Check expiró porque no todos confirmaron.",
      };
      next.phase = "READY";
      system(
        "El Ready Check expiró porque no todos confirmaron. El creador puede iniciar la partida nuevamente.",
      );
      break;
    }
    case "kick": {
      requireHost();
      if (
        action.playerId === state.hostId ||
        ["IN_GAME", "FINISHED"].includes(state.phase)
      )
        throw new Error("No puedes expulsar a este jugador en esta fase.");
      const removed = allPlayers(state).find(
        (player) => player.id === action.playerId,
      );
      if (!removed) throw new Error("El jugador ya no está en esta sala.");
      const wasCaptain = Object.values(state.captains ?? {}).includes(
        removed.id,
      );
      const selected = !!playerTeam(state, removed.id);
      next.radiant = next.radiant.filter((player) => player.id !== removed.id);
      next.dire = next.dire.filter((player) => player.id !== removed.id);
      next.bench = next.bench.filter((player) => player.id !== removed.id);
      next.invitations = next.invitations.map((invite) =>
        invite.status === "INVITED" &&
        (invite.playerId === removed.id || invite.senderId === removed.id)
          ? { ...invite, status: "CANCELLED" }
          : invite,
      );
      next.balanceProposal = null;
      if (selected || wasCaptain) {
        next.phase =
          !wasCaptain && state.captains
            ? state.first
              ? "DRAFTING"
              : "DECIDING_FIRST_PICK"
            : "WAITING";
        next.readyCheck = undefined;
        next.dotaLobby = undefined;
        next.cancelVote = undefined;
        next.matchStartedAt = undefined;
        next.draftTurn = undefined;
        next.highlight = undefined;
        if (next.phase === "DRAFTING") resetDraftTurn();
        if (wasCaptain) {
          next.captains = null;
          next.first = null;
          next.pick = 0;
          next.dice = {};
          next.choicesReady = {};
          next.reveal = null;
          next.firstPickStarted = false;
        }
      }
      system(`${removed.name} fue expulsado de la sala por ${actor.name}.`);
      break;
    }
    case "leave": {
      if (["IN_GAME", "FINISHED"].includes(state.phase))
        throw new Error(
          "No puedes abandonar un encuentro activo desde este control.",
        );
      const selected =
        state.radiant.some((player) => player.id === actorId) ||
        state.dire.some((player) => player.id === actorId);
      next.radiant = next.radiant.filter((player) => player.id !== actorId);
      next.dire = next.dire.filter((player) => player.id !== actorId);
      next.bench = next.bench.filter((player) => player.id !== actorId);
      next.invitations = next.invitations.map((invite) =>
        invite.status === "INVITED" &&
        (invite.playerId === actorId || invite.senderId === actorId)
          ? { ...invite, status: "CANCELLED" }
          : invite,
      );
      if (selected) {
        if (
          state.readyCheck &&
          ["READY_CHECK", "PREPARING", "WAITING_FOR_PLAYERS"].includes(
            state.phase,
          )
        ) {
          next.readyCheck = {
            ...state.readyCheck,
            status: "CANCELLED",
            reason: `${actor.name} abandonó la sala. Un equipo ya no está completo.`,
          };
          system("Ready Check cancelado: un jugador abandonó la sala.");
        }
        next.phase =
          !captainTeam && state.captains
            ? state.first
              ? "DRAFTING"
              : "DECIDING_FIRST_PICK"
            : "WAITING";
        next.balanceProposal = null;
        next.dotaLobby = undefined;
        next.cancelVote = undefined;
        next.matchStartedAt = undefined;
        next.highlight = undefined;
        next.draftTurn = undefined;
        if (next.phase === "DRAFTING") resetDraftTurn();
        if (captainTeam) {
          next.captains = null;
          next.first = null;
          next.pick = 0;
          next.dice = {};
          next.choicesReady = {};
          next.reveal = null;
          next.firstPickStarted = false;
          next.minigameRolling = undefined;
          next.minigameRevealAt = undefined;
        }
      }
      system(`${actor.name} abandonó la sala.`);
      break;
    }
    case "finish": {
      if (!roomFormat(state.mode).rewards)
        throw new Error("La liquidacion Solo Mid requiere reglas propias.");
      requireHost();
      requirePhase("IN_GAME");
      const completed = finishLobbyMatch(next, now, action.winningTeam);
      Object.assign(next, completed);
      system("Partida finalizada. Los Commends son opcionales.");
      break;
    }
    case "chat": {
      const text = action.text.trim();
      if (!text || text.length > roomConfig.messageMaxLength)
        throw new Error("Mensaje inválido.");
      next.messages.push({
        id: next.messages.length,
        kind: "user",
        author: actor.name,
        authorId: actor.id,
        avatar: actor.avatar,
        text,
        time,
      });
      break;
    }
    default:
      throw new Error("Acción no reconocida.");
  }
  return next;
}
