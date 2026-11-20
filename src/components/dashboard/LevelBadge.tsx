"use client";
import Image from "next/image";
import { levelBadge } from "@/lib/level-badge";
import { getXpProgress } from "@/lib/competitive";
import { XpProgress } from "./XpProgress";
import { BadgePopover } from "./BadgePopover";
export function LevelBadge({
  level,
  xp,
  isOwner = true,
  playerName = "Este jugador",
}: {
  level?: number | null;
  xp?: number | bigint | string;
  isOwner?: boolean;
  playerName?: string;
}) {
  const progress =
    xp === undefined
      ? null
      : getXpProgress(typeof xp === "string" ? BigInt(xp) : xp);
  const actualLevel = progress?.level ?? level,
    src = levelBadge(actualLevel);
  const tier = actualLevel ? Math.min(6, Math.ceil(actualLevel / 10)) : 1;
  if (!src) return null;
  return (
    <BadgePopover
      label={`Nivel ${actualLevel}, ver badge de nivel`}
      trigger={
        <Image
          src={src}
          width={24}
          height={24}
          alt=""
          className="size-6 object-contain"
        />
      }
    >
      <div className="flex items-center gap-4">
        <Image
          src={src}
          alt=""
          width={64}
          height={64}
          className="size-16 object-contain"
        />
        <div>
          <p className="dashboard-label">Nivel de Draftory</p>
          <p className="mt-2 text-xl font-semibold text-zinc-100">
            Nivel {actualLevel}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Badge {["I", "II", "III", "IV", "V", "VI"][tier - 1]} ·{" "}
            {tier === 6
              ? "Niveles 51+"
              : `Niveles ${(tier - 1) * 10 + 1}–${tier * 10}`}
          </p>
        </div>
      </div>
      {progress && (
        <div className="mt-5">
          <XpProgress xp={xp!} />
          <p className="mt-2 text-xs text-zinc-500">
            Faltan{" "}
            {(progress.required - progress.current).toLocaleString("es-CO")} XP
            para el nivel {progress.level + 1}
          </p>
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-zinc-400">
        {isOwner
          ? "Juega partidas de Draftory y completa logros para aumentar tu nivel."
          : `Nivel de Draftory de ${playerName}.${progress ? "" : " El progreso detallado de este jugador es privado."}`}
      </p>
    </BadgePopover>
  );
}
