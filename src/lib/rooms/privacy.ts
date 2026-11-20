import { randomBytes, scryptSync, scrypt, timingSafeEqual } from "node:crypto";

export type RoomCredential = { salt: string; hash: string; cost?: number };
export function hashRoomPassword(password: string): RoomCredential {
  if (
    typeof password !== "string" ||
    password.length < 4 ||
    password.length > 64
  )
    throw new Error("Usa una contraseña de 4 a 64 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 32).toString("hex") };
}
export function verifyRoomPassword(
  password: string,
  credential: RoomCredential,
) {
  if (typeof password !== "string" || password.length > 64) return false;
  return timingSafeEqual(
    scryptSync(password, credential.salt, 32, {
      N: credential.cost ?? 16384,
      maxmem: 64 * 1024 * 1024,
    }),
    Buffer.from(credential.hash, "hex"),
  );
}

function validateNewPassword(password: unknown): asserts password is string {
  if (
    typeof password !== "string" ||
    password.length < 4 ||
    password.length > 64 ||
    !password.trim() ||
    /[\u0000-\u001f\u007f]/.test(password)
  )
    throw new Error(
      "Usa una contraseña de 4 a 64 caracteres, sin caracteres de control.",
    );
}
function derive(password: string, salt: string, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashRoomPasswordAsync(
  password: unknown,
): Promise<RoomCredential> {
  validateNewPassword(password);
  const salt = randomBytes(16).toString("hex"),
    cost = 32768;
  return {
    salt,
    hash: (await derive(password, salt, cost)).toString("hex"),
    cost,
  };
}
export async function verifyRoomPasswordAsync(
  password: unknown,
  credential: RoomCredential | null,
) {
  if (
    typeof password !== "string" ||
    password.length > 64 ||
    !credential ||
    !/^[a-f0-9]{32}$/.test(credential.salt) ||
    !/^[a-f0-9]{64}$/.test(credential.hash) ||
    ![16384, 32768].includes(credential.cost ?? 16384)
  )
    return false;
  return timingSafeEqual(
    await derive(password, credential.salt, credential.cost ?? 16384),
    Buffer.from(credential.hash, "hex"),
  );
}
