import type { WardRecord } from "./presentation";
// Source 2 cell coordinates are world units / 128. STRATZ publishes 2-cell quantized positions.
// Analytical 7.41 geography, not the old 7.40 raster. See the nine-landmark audit.
export function worldWardPosition(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const left = (100 * (x - 7487)) / 18322,
    top = (100 * (26015 - y)) / 18322;
  return left < 0 || left > 100 || top < 0 || top > 100 ? null : { left, top };
}
export function calibratedWardPosition(w: Pick<WardRecord, "x" | "y">) {
  return worldWardPosition(w.x * 128, w.y * 128);
}
export function wardTimeline(
  start: number,
  end: number | null,
  min: number,
  max: number,
) {
  const span = max - min;
  if (span <= 0) return null;
  return {
    left: (100 * (Math.max(min, start) - min)) / span,
    width:
      end === null
        ? null
        : (100 * Math.max(0, Math.min(max, end) - Math.max(min, start))) / span,
  };
}
export const wardRanges = { OBSERVER: 1600, SENTRY: 1050 } as const;
// Candidate for the OpenDota coordinate grid. Conversion alone is NOT a calibration certificate.
export function candidateWardPosition(w: Pick<WardRecord, "x" | "y">) {
  if (
    !Number.isFinite(w.x) ||
    !Number.isFinite(w.y) ||
    w.x < 64 ||
    w.x > 191 ||
    w.y < 64 ||
    w.y > 191
  )
    return null;
  return { left: (100 * (w.x - 64)) / 127, top: (100 * (191 - w.y)) / 127 };
}
export const visionCalibration = {
  matchId: "9039295139",
  version: "7.41f",
  imageVersion: "7.40",
  matched: 97,
  compatible: 101,
  total: 101,
  projectionVerified: false,
  reason:
    "Las coordenadas coinciden con una cuadrícula de dos unidades. Falta contrastar puntos geográficos y límites del mapa 7.41f con esta imagen 7.40.",
} as const;
