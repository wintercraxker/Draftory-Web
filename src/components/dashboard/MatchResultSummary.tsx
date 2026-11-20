"use client";
import { useEffect, useState } from "react";
import type { DashboardMatch } from "@/lib/dashboard-data";
import { normalizeRoomMode, roomFormat } from "@/lib/rooms/lobby-options.mjs";
import styles from "./MatchResultSummary.module.css";

function EloDelta({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 450);
      setDisplay(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">
        {display > 0 ? "+" : ""}
        {display}
      </span>
      <span className={styles.srOnly}>
        {value > 0 ? "+" : ""}
        {value}
      </span>
    </>
  );
}

// Presentation only: rewards come from persisted ledgers, never from a score.
export function MatchResultSummary({ match }: { match: DashboardMatch }) {
  if (
    match.tracking?.result !== "VERIFIED" ||
    !match.winningSide ||
    match.result === "Sin resultado"
  )
    return null;
  const mode = normalizeRoomMode(match.mode);
  const eligible = mode ? roomFormat(mode).rewards : null;
  return (
    <section
      className={styles.summary}
      data-result={match.result}
      aria-label="Resultado y recompensas registradas"
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Resultado verificado</p>
          <h3>{match.result === "Victoria" ? "VICTORIA" : "DERROTA"}</h3>
        </div>
        <p>
          Ganador:{" "}
          <strong>
            {match.winningSide === "RADIANT" ? "Radiant" : "Dire"}
          </strong>
        </p>
      </div>
      {eligible === false ? (
        <p className={styles.note}>
          Este modo no otorga ELO, puntos ni XP competitivos.
        </p>
      ) : (
        <dl className={styles.rewards}>
          {match.eloChange !== undefined && (
            <div>
              <dt>ELO registrado</dt>
              <dd className={styles.delta}>
                <EloDelta value={match.eloChange} />
              </dd>
              {match.eloBefore !== undefined &&
                match.eloAfter !== undefined && (
                  <small>
                    {match.eloBefore.toLocaleString("es-CO")} →{" "}
                    {match.eloAfter.toLocaleString("es-CO")}
                  </small>
                )}
            </div>
          )}
          {match.pointsChange !== undefined && (
            <div>
              <dt>Puntos</dt>
              <dd>+{match.pointsChange}</dd>
              <small>Abonados en tu cuenta</small>
            </div>
          )}
          {match.xpChange !== undefined && (
            <div>
              <dt>Experiencia</dt>
              <dd>+{match.xpChange} XP</dd>
              <small>Progresión registrada</small>
            </div>
          )}
        </dl>
      )}
      {eligible !== false &&
        match.eloChange === undefined &&
        match.pointsChange === undefined &&
        match.xpChange === undefined && (
          <p className={styles.note}>
            Las recompensas todavía no constan en tu historial.
          </p>
        )}
    </section>
  );
}
