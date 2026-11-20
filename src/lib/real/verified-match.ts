import { Prisma } from "../../generated/prisma/client";
// Internal Draftory results only. The result must already have trusted authority;
// neither this predicate nor a reader can verify/finalize a match.
export const verifiedDraftorySql = Prisma.sql`m."roomId" IS NOT NULL AND m.status='COMPLETED' AND m."winningSide" IS NOT NULL AND m."verifiedAt" IS NOT NULL AND m."finishedAt" IS NOT NULL
  AND m.mode IN ('ALL_PICK','CAPTAINS_MODE','TURBO')
  AND (SELECT count(*) FROM "MatchPlayer" roster WHERE roster."matchId"=m.id)=10
  AND (SELECT count(*) FROM "MatchPlayer" roster WHERE roster."matchId"=m.id AND roster."teamSide"='RADIANT')=5
  AND (SELECT count(*) FROM "MatchPlayer" roster WHERE roster."matchId"=m.id AND roster."teamSide"='DIRE')=5`;
export function verifiedDraftoryMatch(match: {
  roomId: string | null;
  status: string;
  winningSide: string | null;
  verifiedAt: Date | null;
  finishedAt: Date | null;
  players: { teamSide: string }[];
  mode?: string;
}) {
  return (
    !!match.roomId &&
    match.status === "COMPLETED" &&
    !!match.winningSide &&
    !!match.verifiedAt &&
    !!match.finishedAt &&
    (!match.mode ||
      ["ALL_PICK", "CAPTAINS_MODE", "TURBO"].includes(match.mode)) &&
    match.players.length === 10 &&
    match.players.filter((p) => p.teamSide === "RADIANT").length === 5 &&
    match.players.filter((p) => p.teamSide === "DIRE").length === 5
  );
}
