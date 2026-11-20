import { Star } from "lucide-react";
import type { MatchCompletion } from "@/lib/rooms/recognition";
import { PlayerAvatar, PlayerName } from "./PlayerIdentity";
export function MatchRecognition({ match }: { match: MatchCompletion }) {
  if (!match.finalized)
    return (
      <p className="mt-4 text-xs text-zinc-500">
        Commends abiertos · el MVP social se determinará al cerrar el período de
        votación.
      </p>
    );
  const players = [...match.radiant, ...match.dire].filter((player) =>
    match.mvpIds.includes(player.id),
  );
  if (!players.length)
    return (
      <p className="mt-4 text-xs text-zinc-500">
        No hubo Commends en esta partida.
      </p>
    );
  return (
    <section
      className="match-mvp"
      aria-label={players.length > 1 ? "MVP compartido" : "MVP de la partida"}
    >
      <h3 className="dashboard-label flex items-center justify-center gap-2">
        <Star size={15} className="text-violet-200" />
        {players.length > 1
          ? "MVPs de la partida · compartido"
          : "MVP de la partida"}
      </h3>
      <div className="match-mvp-winners">
        {players.map((player) => (
          <div key={player.id} className="match-mvp-winner">
            <div className="match-mvp-avatar">
              <PlayerAvatar player={player} size={56} className="rounded-2xl" />
              <Star size={12} />
            </div>
            <PlayerName
              showLevel={false}
              player={player}
              className="mt-3 text-base font-semibold text-zinc-100"
            />
            <p className="mt-1 text-xs text-violet-200/80">
              {match.commends.filter((vote) => vote.to === player.id).length}{" "}
              Commends
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
