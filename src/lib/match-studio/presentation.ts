import type { StudioPlayer } from "./model";
export type WardRecord = {
  id: string;
  playerKey: string;
  side: "RADIANT" | "DIRE";
  type: "OBSERVER" | "SENTRY";
  time: number;
  end: number | null;
  destroyerKey: string | null;
  x: number;
  y: number;
};
export function skillLabel(
  p: StudioPlayer,
  abilityId: number,
  talent: boolean,
) {
  const meta = p.abilityMeta.find((a) => a.id === abilityId);
  if (meta?.image?.endsWith("/special_bonus_attributes.png"))
    return "Bonificación de atributos";
  const valid =
    meta?.name &&
    !/^[a-z0-9_]+$/.test(meta.name) &&
    !meta.name.startsWith("special_bonus");
  return valid
    ? meta!.name
    : talent
      ? "Talento · descripción no publicada"
      : "Habilidad · nombre no publicado";
}
export function skillAtLevel(p: StudioPlayer, level: number) {
  return p.learning.filter((e) => e.level === level);
}
export function talentRows(p: StudioPlayer) {
  return [25, 20, 15, 10].map((level) => ({
    level,
    options: [0, 1].map((side) => {
      const slot = ((level - 10) / 5) * 2 + side,
        items = p.talents?.filter((t) => t.slot === slot) ?? [];
      const talent = items.length === 1 ? items[0] : null;
      return {
        talent,
        chosen:
          !!talent &&
          p.learning.some((e) => e.abilityId === talent.abilityId && e.talent),
      };
    }),
  }));
}
export function verifiedTalent(p: StudioPlayer, abilityId: number) {
  return p.talents?.some((t) => t.abilityId === abilityId) === true;
}
export function normalizeWards(
  raw: unknown,
  players: StudioPlayer[],
): WardRecord[] {
  if (!Array.isArray(raw)) return [];
  const events = raw.filter(
    (v): v is Record<string, unknown> =>
      !!v &&
      typeof v === "object" &&
      Number.isFinite(v.time) &&
      Number.isSafeInteger(v.indexId),
  );
  return events
    .filter((e) => e.action === "SPAWN")
    .flatMap((e) => {
      const p = players.find((p) => p.slot === e.fromPlayer);
      if (
        !p?.side ||
        (e.wardType !== "OBSERVER" && e.wardType !== "SENTRY") ||
        !Number.isFinite(e.positionX) ||
        !Number.isFinite(e.positionY)
      )
        return [];
      const nextSpawn = events
        .filter(
          (x) =>
            x.indexId === e.indexId &&
            x.action === "SPAWN" &&
            Number(x.time) > Number(e.time),
        )
        .sort((a, b) => Number(a.time) - Number(b.time))[0];
      const ends = events
        .filter(
          (x) =>
            x.indexId === e.indexId &&
            x.fromPlayer === e.fromPlayer &&
            x.wardType === e.wardType &&
            x.action === "DESPAWN" &&
            Number(x.time) >= Number(e.time) &&
            (!nextSpawn || Number(x.time) < Number(nextSpawn.time)),
        )
        .sort((a, b) => Number(a.time) - Number(b.time));
      const end = ends[0],
        destroyer = players.find((p) => p.slot === end?.playerDestroyed);
      return [
        {
          id: `${e.indexId}:${e.time}:${e.fromPlayer}`,
          playerKey: p.key,
          side: p.side,
          type: e.wardType,
          time: Number(e.time),
          end: end ? Number(end.time) : null,
          destroyerKey: destroyer?.key ?? null,
          x: Number(e.positionX),
          y: Number(e.positionY),
        },
      ];
    });
}
export function filterWards(
  wards: WardRecord[],
  selected: string[],
  side: string,
  type: string,
  time: number | null,
  active: boolean,
) {
  return wards.filter(
    (w) =>
      selected.includes(w.playerKey) &&
      (side === "BOTH" || w.side === side) &&
      (type === "BOTH" || w.type === type) &&
      (time === null || w.time <= time) &&
      (!active || (time !== null && w.end !== null && w.end > time)),
  );
}
