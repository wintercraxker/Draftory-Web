"use client";
import { useState } from "react";
import {
  Award,
  Flame,
  Footprints,
  Medal,
  Shield,
  Star,
  ThumbsUp,
} from "lucide-react";
import {
  achievementDefinitions,
  type Achievement,
} from "@/lib/progression/config";
const icons = {
  first: Footprints,
  firstwin: Award,
  streak: Flame,
  veteran: Shield,
  wins: Award,
  commended: ThumbsUp,
  mvp: Star,
  legend: Medal,
  ascension: Medal,
  competitor: Shield,
};
export { icons as achievementIcons };
export function Achievements({
  items = achievementDefinitions.map((item) => ({ ...item, progress: 0 })),
  pending = false,
}: {
  items?: Achievement[];
  pending?: boolean;
}) {
  const [all, setAll] = useState(false);
  const unlocked = items.filter((item) => item.unlockedAt !== undefined);
  const visible = all
    ? items
    : (unlocked.length ? unlocked : items).slice(0, 3);
  return (
    <section className="dashboard-panel rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="dashboard-eyebrow">Progreso</p>
          <h2 className="dashboard-section-title mt-2">Logros</h2>
        </div>
        <button
          className="dashboard-link-button text-xs"
          disabled={pending}
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "Destacados" : "Ver todos"}
        </button>
      </div>
      <div className="achievement-grid">
        {!pending &&
          visible.map((item) => {
            const Icon = icons[item.id];
            return (
              <article
                key={item.id}
                className={`achievement-item ${item.unlockedAt !== undefined ? "achievement-unlocked" : ""}`}
              >
                <Icon size={19} />
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  {!!item.rewardXp && (
                    <span className="text-violet-300/80">
                      +{item.rewardXp} XP
                    </span>
                  )}
                  {item.unlockedAt !== undefined ? (
                    <time dateTime={new Date(item.unlockedAt).toISOString()}>
                      {new Date(item.unlockedAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  ) : (
                    <span>
                      {item.progress} / {item.target}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
      </div>
      {pending && (
        <p className="mt-4 text-xs text-zinc-500">
          Logros pendientes de conectar.
        </p>
      )}
      {!pending && !visible.length && (
        <p className="mt-4 text-xs text-zinc-500">
          Todavía no hay logros desbloqueados. Se obtienen jugando y recibiendo
          reconocimiento en Draftory.
        </p>
      )}
    </section>
  );
}
