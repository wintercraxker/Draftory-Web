export type TourRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export function placeTour(
  view: {
    width: number;
    height: number;
    safeTop?: number;
    safeBottom?: number;
  },
  panel: { width: number; height: number },
  target: TourRect | null,
) {
  const margin = 16,
    topMargin = Math.max(36, (view.safeTop ?? 0) + 16),
    gap = 18;
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(n, Math.max(min, max)));
  const fit = (left: number, top: number) => ({
    left: clamp(left, margin, view.width - panel.width - margin),
    top: clamp(
      top,
      topMargin,
      view.height - panel.height - margin - (view.safeBottom ?? 0),
    ),
  });
  if (!target)
    return fit(
      (view.width - panel.width) / 2,
      (view.height - panel.height) / 2,
    );
  const cx = target.left + target.width / 2,
    cy = target.top + target.height / 2;
  const candidates = [
    fit(target.left + target.width + gap, cy - panel.height / 2),
    fit(target.left - panel.width - gap, cy - panel.height / 2),
    fit(cx - panel.width / 2, target.top + target.height + gap),
    fit(cx - panel.width / 2, target.top - panel.height - gap),
  ];
  const overlap = (p: { left: number; top: number }) =>
    Math.max(
      0,
      Math.min(p.left + panel.width, target.left + target.width) -
        Math.max(p.left, target.left),
    ) *
    Math.max(
      0,
      Math.min(p.top + panel.height, target.top + target.height) -
        Math.max(p.top, target.top),
    );
  return candidates
    .map((p, i) => ({ p, score: overlap(p) * 1000 + i }))
    .sort((a, b) => a.score - b.score)[0].p;
}
