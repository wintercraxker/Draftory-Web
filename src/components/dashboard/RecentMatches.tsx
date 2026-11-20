import type { DashboardMatch } from "@/lib/dashboard-data";
import { MatchHistory } from "./MatchHistory";
export function RecentMatches({
  matches,
  limit,
  ownerName,
  ownerId,
}: {
  matches: DashboardMatch[];
  limit?: number;
  ownerName?: string;
  ownerId?: string;
}) {
  return (
    <MatchHistory
      matches={matches}
      limit={limit}
      ownerName={ownerName}
      ownerId={ownerId}
    />
  );
}
