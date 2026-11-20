export type Room = {
  id: string;
  title: string;
  mode: string;
  region: string;
  host: string;
  hostId?: string;
  isPrivate?: boolean;
  players: number;
  status:
    | "waiting"
    | "draft"
    | "ready_check"
    | "preparing"
    | "waiting_for_players"
    | "live"
    | "finished";
  formation?: "automatic" | "captains";
};

export function roomStatusForPhase(
  phase: import("./rooms/engine").Phase,
): Room["status"] {
  return phase === "DRAFTING"
    ? "draft"
    : phase === "READY_CHECK"
      ? "ready_check"
      : phase === "PREPARING"
        ? "preparing"
        : phase === "WAITING_FOR_PLAYERS"
          ? "waiting_for_players"
          : phase === "IN_GAME"
            ? "live"
            : phase === "FINISHED"
              ? "finished"
              : "waiting";
}

export const mockRooms: Room[] = [
  {
    id: "ancients",
    title: "Stacked Ancients #04",
    mode: "All Pick",
    region: "Sudamérica",
    host: "Vicky",
    players: 8,
    status: "waiting",
  },
  {
    id: "aurora",
    title: "Aurora vs Nova",
    mode: "Captain's Mode",
    region: "Sudamérica",
    host: "Kyowa",
    players: 10,
    status: "live",
  },
  {
    id: "nightfall",
    title: "Nightfall · Inhouse",
    mode: "Captain's Mode",
    region: "US East",
    host: "Snok",
    players: 6,
    status: "waiting",
  },
  {
    id: "late-stack",
    title: "Una más y nos vamos",
    mode: "All Pick",
    region: "Sudamérica",
    host: "Mika",
    players: 4,
    status: "waiting",
  },
];
