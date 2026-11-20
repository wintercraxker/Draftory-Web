export const avatarConfig = {
  outputSize: 256,
  maxFileBytes: 5 * 1024 * 1024,
  maxStoredBytes: 300_000,
  allowedTypes: ["image/png", "image/jpeg", "image/webp"],
  maxZoom: 3,
};
export function avatarCrop(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
) {
  const crop = Math.min(width, height) / zoom;
  return {
    size: crop,
    x: Math.max(0, Math.min(width - crop, (width - crop) / 2 + x)),
    y: Math.max(0, Math.min(height - crop, (height - crop) / 2 + y)),
  };
}
