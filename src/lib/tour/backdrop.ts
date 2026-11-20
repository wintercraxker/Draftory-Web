import type { TourRect } from "./placement";
// Disjoint panes leave an unfiltered hole, rather than a blurred clone.
export function tourBackdrop(
  view: { width: number; height: number },
  target: TourRect | null,
): TourRect[] {
  const { width, height } = view;
  if (width <= 0 || height <= 0) return [];
  if (!target) return [{ left: 0, top: 0, width, height }];
  const left = Math.max(0, Math.min(width, target.left)),
    top = Math.max(0, Math.min(height, target.top));
  const right = Math.max(left, Math.min(width, target.left + target.width)),
    bottom = Math.max(top, Math.min(height, target.top + target.height));
  return [
    { left: 0, top: 0, width, height: top },
    { left: 0, top: bottom, width, height: height - bottom },
    { left: 0, top, width: left, height: bottom - top },
    { left: right, top, width: width - right, height: bottom - top },
  ].filter((r) => r.width > 0 && r.height > 0);
}
