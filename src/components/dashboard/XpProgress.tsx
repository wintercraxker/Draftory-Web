import { getXpProgress } from "@/lib/competitive";

export function XpProgress({ xp }: { xp: number | bigint | string }) {
  const progress = getXpProgress(typeof xp === "string" ? BigInt(xp) : xp);
  return (
    <div className="min-w-0">
      <div className="dashboard-xp-label mb-2 flex flex-wrap justify-between gap-2">
        <span className="font-semibold text-zinc-200">
          Nivel {progress.level}
        </span>
        <span>
          {progress.current.toLocaleString("en-US")} /{" "}
          {progress.required.toLocaleString("en-US")} XP
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Experiencia hacia el siguiente nivel"
        aria-valuemin={0}
        aria-valuemax={progress.required}
        aria-valuenow={progress.current}
        className="dashboard-xp-track overflow-hidden rounded-full"
      >
        <div
          className="dashboard-xp-fill h-full rounded-full transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${(progress.current / progress.required) * 100}%` }}
        />
      </div>
    </div>
  );
}
