export function WinrateDonut({
  winrate,
  played,
}: {
  winrate: number;
  played: number;
}) {
  const circumference = 2 * Math.PI * 78;
  return (
    <div
      className="dashboard-winrate-donut"
      role="img"
      aria-label={
        played
          ? `${Math.round(winrate)}% de victorias en ${played} partidas terminadas`
          : "Sin partidas terminadas"
      }
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="#26232d"
          strokeWidth="12"
        />
        <circle
          className="dashboard-winrate-ring"
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="#b6a1ed"
          strokeWidth="12"
          strokeLinecap={winrate > 0 ? "round" : "butt"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - winrate / 100)}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div>
        <strong>{Math.round(winrate)}%</strong>
        <span>Winrate</span>
      </div>
    </div>
  );
}
