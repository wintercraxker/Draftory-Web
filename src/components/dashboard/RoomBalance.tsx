import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { ArrowRight, Check } from "lucide-react";
import type { BalanceProposal } from "@/lib/rooms/balance";
import type { Player } from "@/lib/competitive";

const number = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 1 });
export function RoomBalance({
  proposal,
  players,
  canApply,
  canCancel,
  onApply,
  onCancel,
}: {
  proposal: BalanceProposal;
  players: Player[];
  canApply: boolean;
  canCancel: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const reduction =
    proposal.before.totalDifference - proposal.after.totalDifference;
  const improvement =
    proposal.before.totalDifference > 0
      ? (reduction / proposal.before.totalDifference) * 100
      : 0;
  const oldRadiant = new Set(proposal.beforeRadiantIds);
  const swaps = players.filter(
    (player) =>
      oldRadiant.has(player.id) !== proposal.radiantIds.includes(player.id),
  );
  return (
    <section
      aria-label="Propuesta de balance"
      className="room-balance-proposal"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="dashboard-label text-violet-200">
          Propuesta de balance
        </h3>
        <span className="text-[10px] text-zinc-500">Pendiente de aplicar</span>
      </header>
      <div className="room-balance-comparison">
        {[
          { title: "Actual", metrics: proposal.before },
          { title: "Propuesta", metrics: proposal.after },
        ].map(({ title, metrics }) => (
          <div key={title}>
            <p className="dashboard-label mb-2">{title}</p>
            <dl>
              {(["radiant", "dire"] as const).map((team) => (
                <div key={team}>
                  <dt className="capitalize">{team}</dt>
                  <dd>
                    {number(metrics[team].total)} <small>MMR</small>
                  </dd>
                </div>
              ))}
              <div className="room-balance-difference">
                <dt>Diferencia total</dt>
                <dd>
                  {number(metrics.totalDifference)} <small>MMR</small>
                </dd>
              </div>
            </dl>
          </div>
        ))}
        <div className="room-balance-improvement">
          <p className="dashboard-label">Mejora</p>
          <p className="flex flex-wrap items-center gap-2">
            {number(proposal.before.totalDifference)}
            <ArrowRight size={13} />
            {number(proposal.after.totalDifference)}{" "}
            <span className="text-[10px] text-zinc-500">MMR total</span>
          </p>
          <span>
            {reduction > 0
              ? `${number(improvement)}% menos diferencia`
              : "El reparto actual ya es óptimo"}
          </span>
        </div>
      </div>
      <div className="room-balance-swaps">
        {swaps.length ? (
          swaps.map((player) => (
            <p key={player.id}>
              <strong>
                <PlayerDisplayName id={player.id} name={player.name} />
              </strong>
              <span>
                {oldRadiant.has(player.id) ? "Radiant" : "Dire"}
                <ArrowRight size={11} />
                {oldRadiant.has(player.id) ? "Dire" : "Radiant"}
              </span>
            </p>
          ))
        ) : (
          <p className="text-[11px] text-zinc-500">
            No hacen falta intercambios.
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2">
        {!canApply && (
          <p className="mr-auto text-[10px] text-zinc-500">
            Solo el creador puede aplicar el balance.
          </p>
        )}
        {canCancel && (
          <button
            className="dashboard-button px-3 py-2 text-xs"
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
        {canApply && (
          <button className="dashboard-primary-button" onClick={onApply}>
            <Check size={13} />
            Aplicar balance
          </button>
        )}
      </footer>
    </section>
  );
}
