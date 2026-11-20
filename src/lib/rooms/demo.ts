import {
  allPlayers,
  createLobby,
  asRoomPlayer,
  playerTeam,
  type LobbyState,
  type Team,
} from "./engine";
import { demoPlayers } from "./mock";
import { roomConfig } from "./config";

export type DemoRoomAction =
  | "addPlayer"
  | "fillBench"
  | "fill5v5"
  | "clearTeams"
  | "reset"
  | "allReady"
  | "nextReady";
export const demoRoomConfig = { participants: 19 };

// Explicit development adapter. Never expose these shortcuts as real room commands.
export function applyDemoRoomAction(
  state: LobbyState,
  action: DemoRoomAction,
  actorId: string,
  time: string,
): LobbyState {
  if (actorId !== state.hostId)
    throw new Error("Solo el creador puede usar las herramientas demo.");
  if (
    !["addPlayer", "fillBench", "fill5v5", "clearTeams", "reset"].includes(
      action,
    )
  )
    throw new Error("Herramienta demo inválida.");
  if (
    [
      "READY_CHECK",
      "PREPARING",
      "WAITING_FOR_PLAYERS",
      "IN_GAME",
      "FINISHED",
    ].includes(state.phase) &&
    action !== "reset"
  )
    throw new Error(
      "Los equipos están bloqueados. Resetea la demo para volver a probar.",
    );
  const participants = allPlayers(state);
  const host = participants.find((player) => player.id === state.hostId);
  if (!host) throw new Error("El creador debe pertenecer a la sala.");
  const note = (next: LobbyState, text: string) => ({
    ...next,
    messages: [
      ...state.messages,
      {
        id: state.messages.length,
        kind: "system" as const,
        text: `DEMO: ${text}`,
        time,
      },
    ],
  });
  if (action === "reset")
    return note(
      {
        ...createLobby(state.hostId, [host], state.formation, state.roomId),
        attempt: state.attempt,
        game: state.game,
      },
      "sala reiniciada.",
    );
  if (action === "clearTeams")
    return note(
      {
        ...createLobby(
          state.hostId,
          participants,
          state.formation,
          state.roomId,
        ),
        attempt: state.attempt,
        radiant: [],
        dire: [],
        bench: participants,
        game: state.game,
      },
      "equipos vaciados; todos vuelven al banco.",
    );
  const ids = new Set(participants.map((player) => player.id));
  const available = demoPlayers(
    participants.length + demoRoomConfig.participants,
  )
    .filter((player) => !ids.has(player.id))
    .map(asRoomPlayer);
  if (action === "addPlayer" || action === "fillBench") {
    const count =
      action === "addPlayer"
        ? 1
        : Math.max(0, demoRoomConfig.participants - participants.length);
    return note(
      { ...state, bench: [...state.bench, ...available.slice(0, count)] },
      `${count} ${count === 1 ? "jugador añadido" : "jugadores añadidos"} al banco.`,
    );
  }
  const pool = [
    ...participants,
    ...available.slice(
      0,
      Math.max(0, demoRoomConfig.participants - participants.length),
    ),
  ];
  const hostSide = playerTeam(state, state.hostId) ?? "radiant";
  const opposite: Team = hostSide === "radiant" ? "dire" : "radiant";
  const captains =
    state.formation === "captains"
      ? (state.captains ??
        ({
          [hostSide]: host.id,
          [opposite]: (state[opposite][0] ??
            pool.find((player) => player.id !== host.id))!.id,
        } as { radiant: string; dire: string }))
      : null;
  const used = new Set<string>();
  const teams = { radiant: [] as typeof pool, dire: [] as typeof pool };
  const assign = (id: string, side: Team) => {
    const player = pool.find((value) => value.id === id);
    if (!player || used.has(id) || teams[side].length >= roomConfig.teamSize)
      throw new Error("No se puede conservar esta composición de capitanes.");
    teams[side].push(player);
    used.add(id);
  };
  if (captains) {
    assign(captains.radiant, "radiant");
    assign(captains.dire, "dire");
  }
  if (!used.has(host.id)) assign(host.id, hostSide);
  for (const side of ["radiant", "dire"] as const) {
    for (const player of state[side])
      if (!used.has(player.id) && teams[side].length < roomConfig.teamSize)
        assign(player.id, side);
  }
  for (const side of ["radiant", "dire"] as const) {
    for (const player of pool)
      if (!used.has(player.id) && teams[side].length < roomConfig.teamSize)
        assign(player.id, side);
  }
  return note(
    {
      ...state,
      ...teams,
      bench: pool.filter((player) => !used.has(player.id)),
      captains,
      phase: "READY",
      first: captains ? (state.first ?? hostSide) : null,
      firstPickSource: captains
        ? state.first
          ? state.firstPickSource
          : "demo"
        : undefined,
      pick: captains ? roomConfig.pickOrder.length : 0,
      highlight: undefined,
      draftTurn: undefined,
      invitations: state.invitations.map((invite) =>
        invite.status === "INVITED"
          ? { ...invite, status: "CANCELLED" }
          : invite,
      ),
      balanceProposal: null,
    },
    "5v5 completado; se omite el draft para probar inicio y balance.",
  );
}
