import { stat } from "node:fs/promises";
import path from "node:path";
import { tourImage } from "./steps";
// Only the configured local artwork names; no URLs/user-provided paths.
export async function availableTourImages(
  publicRoot = path.join(process.cwd(), "public"),
) {
  const images = await Promise.all(
    [tourImage].map(async (image) => {
      try {
        return (await stat(path.join(publicRoot, image.slice(1)))).isFile()
          ? image
          : null;
      } catch {
        return null;
      }
    }),
  );
  return images.filter(
    (image): image is NonNullable<typeof image> => image !== null,
  );
}
