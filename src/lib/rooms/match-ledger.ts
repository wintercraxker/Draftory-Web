import type { Room } from "../room-mock-data";
import type { Player } from "../competitive";
import {
  closeCommends,
  getRecognitionStats,
  type MatchCompletion,
} from "./recognition";
import { recordMatchRewards } from "../progression/server";
import type { RoomPlayer } from "./engine";

function profileSnapshot(player: Player) {
  const { roomRole, ...profile } = player as RoomPlayer;
  void roomRole;
  return profile;
}

type Record = { match: MatchCompletion; room: Room };
const shared = globalThis as typeof globalThis & {
  draftoryMatches?: Map<string, Record>;
  draftoryParticipants?: Map<string, Player>;
  draftoryPlayerResultTimes?: Map<string, number>;
};
const matches = (shared.draftoryMatches ??= new Map<string, Record>());
const players = (shared.draftoryParticipants ??= new Map<string, Player>());
const resultTimes = (shared.draftoryPlayerResultTimes ??= new Map<
  string,
  number
>());
// Same in-memory persistence boundary as the existing room demo. No player API
// can submit a result, ELO award or fabricated Commend count to this ledger.
export function registerParticipants(participants: Player[]) {
  for (const player of participants) {
    const current = players.get(player.id);
    players.set(
      player.id,
      structuredClone(
        profileSnapshot(
          current && resultTimes.has(player.id)
            ? {
                ...player,
                elo: current.elo,
                xp: current.xp,
                level: current.level,
              }
            : player,
        ),
      ),
    );
  }
}
export function recordCompletedMatch(match: MatchCompletion, room: Room) {
  matches.set(match.id, {
    match: structuredClone(match),
    room: structuredClone(room),
  });
  for (const player of [...match.radiant, ...match.dire])
    if (match.finishedAt >= (resultTimes.get(player.id) ?? -1)) {
      players.set(player.id, structuredClone(profileSnapshot(player)));
      resultTimes.set(player.id, match.finishedAt);
    }
  recordMatchRewards(match);
}
export function readMatchLedger(now: number) {
  for (const [id, record] of matches) {
    const closed = closeCommends(record.match, now);
    if (closed !== record.match) {
      matches.set(id, { ...record, match: closed });
      recordMatchRewards(closed);
    }
  }
  return [...matches.values()].map((record) => structuredClone(record));
}
export function readParticipant(id: string) {
  const player = players.get(id);
  return player ? structuredClone(player) : undefined;
}
export function readSocialStats(id: string, now: number) {
  return getRecognitionStats(
    id,
    readMatchLedger(now).map((record) => record.match),
  );
}
