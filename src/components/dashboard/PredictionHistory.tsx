import { Diamond, RotateCcw, Check, X, Clock } from "lucide-react";
import type { Prediction } from "@/lib/progression/server";
import { EmptyState } from "./DashboardUi";

const statuses = {
  PENDING: { label: "Pendiente", icon: Clock },
  WON: { label: "Acertada", icon: Check },
  LOST: { label: "Fallida", icon: X },
  VOID: { label: "Anulada", icon: RotateCcw },
};
export type PredictionView = Omit<Prediction, "amount" | "payout"> & {
  amount: number | string;
  payout?: number | string;
  potentialReturn?: string;
};
export function PredictionHistory({
  tickets,
  admissionPending,
}: {
  tickets: PredictionView[];
  admissionPending?: string;
}) {
  if (!tickets.length)
    return (
      <EmptyState
        compact
        icon={Diamond}
        title="No hay predicciones todavía."
        description={
          admissionPending ??
          "Haz tu primera predicción desde Predicciones → Disponibles, durante los primeros cinco minutos."
        }
      />
    );
  return (
    <div className="prediction-history">
      {[...tickets]
        .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
        .map((ticket) => {
          const status = statuses[ticket.status];
          const Icon = status.icon;
          return (
            <article className="prediction-history-row" key={ticket.id}>
              <div>
                <h3>{ticket.matchName}</h3>
                <p>
                  {ticket.team.toUpperCase()} · {ticket.amount} pts @{" "}
                  {ticket.odds.toFixed(2)}
                </p>
              </div>
              <span
                className={`prediction-status prediction-status-${ticket.status.toLowerCase()}`}
              >
                <Icon size={12} />
                {status.label}
              </span>
              <div className="prediction-history-amount">
                {ticket.status === "PENDING" ? (
                  <>
                    <strong>
                      {ticket.potentialReturn ??
                        Math.floor(Number(ticket.amount) * ticket.odds)}{" "}
                      pts
                    </strong>
                    <small>Retorno potencial</small>
                  </>
                ) : ticket.status === "LOST" ? (
                  <>
                    <strong>−{ticket.amount} pts</strong>
                    <small>Descontados al confirmar</small>
                  </>
                ) : (
                  <>
                    <strong>+{ticket.payout} pts</strong>
                    <small>
                      {ticket.status === "VOID"
                        ? "Devueltos · partida cancelada"
                        : "Retorno total"}
                    </small>
                  </>
                )}
              </div>
            </article>
          );
        })}
    </div>
  );
}
