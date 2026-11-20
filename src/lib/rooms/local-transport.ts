import { transitionLobby, type Action, type LobbyState } from "./engine";
// Minigame results come from the server demo service. Dice ties reopen both turns.
export function dispatchLocal(
  state: LobbyState,
  action: Action,
  actorId: string,
  time: string,
) {
  return transitionLobby(state, action, actorId, time, Date.now());
}
