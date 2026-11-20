import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { AccountError } from "./http";
import { readRealProfile } from "./profile-repository";

export async function normalizeAvatar(
  input: Uint8Array,
  mime: string,
  name: string,
) {
  if (!input.length || input.length > 5 * 1024 * 1024)
    throw new AccountError("La imagen debe pesar como máximo 5 MB.", 413);
  const b = Buffer.from(input);
  const format = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "jpeg"
      : b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP"
        ? "webp"
        : null;
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (
    !format ||
    mime !== `image/${format}` ||
    !{ png: ["png"], jpeg: ["jpg", "jpeg"], webp: ["webp"] }[format].includes(
      extension ?? "",
    )
  )
    throw new AccountError("Selecciona una imagen PNG, JPG o WEBP válida.");
  try {
    const image = sharp(b, { failOn: "warning", limitInputPixels: 40000000 });
    const m = await image.metadata();
    if (m.format !== format || !m.width || !m.height || (m.pages ?? 1) > 1)
      throw new Error();
    const output = await image
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 88 })
      .toBuffer();
    if (output.length > 300000) throw new Error();
    return output;
  } catch {
    throw new AccountError(
      "La imagen no es válida o sus dimensiones son excesivas.",
    );
  }
}
export async function saveAvatar(
  userId: string,
  input: Uint8Array,
  mime: string,
  name: string,
) {
  const bytes = await normalizeAvatar(input, mime, name),
    version = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    await tx.profileAvatar.upsert({
      where: { userId },
      create: { userId, version, bytes: new Uint8Array(bytes) },
      update: { version, bytes: new Uint8Array(bytes) },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        customAvatarUrl: `/api/profile/avatar/${encodeURIComponent(userId)}/${version}`,
      },
    });
  });
  return readRealProfile(userId);
}
export async function removeAvatar(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { customAvatarUrl: null },
    });
    await tx.profileAvatar.deleteMany({ where: { userId } });
  });
  return readRealProfile(userId);
}
