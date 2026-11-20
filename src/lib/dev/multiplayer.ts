import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AccountError } from "../real/http";
import {
  createRealRoom,
  listRealRooms,
  roomAction,
} from "../real/room-repository";

export const multiplayerNamespace = "draftory_multiplayer_test";
export function multiplayerEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DRAFTORY_ENABLE_MULTIPLAYER_TEST === "true"
  );
}
const clients = globalThis as unknown as {
  multiplayerDb?: PrismaClient;
  multiplayerUrl?: string;
};
export function multiplayerConnection() {
  if (!multiplayerEnabled()) throw new AccountError("No disponible.", 404);
  const connection = process.env.DRAFTORY_MULTIPLAYER_DATABASE_URL;
  if (!connection)
    throw new AccountError(
      "Configura DRAFTORY_MULTIPLAYER_DATABASE_URL y ejecuta la instalación aislada.",
      503,
    );
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new AccountError("Configuración aislada inválida.", 503);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    decodeURIComponent(url.pathname) !== "/" + multiplayerNamespace ||
    url.search ||
    url.hash
  )
    throw new AccountError(
      "La herramienta exige una base local dedicada draftory_multiplayer_test; nunca usa discordbets/public.",
      503,
    );
  return connection;
}
export async function multiplayerDb() {
  const connection = multiplayerConnection();
  if (!clients.multiplayerDb || clients.multiplayerUrl !== connection) {
    clients.multiplayerDb = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: connection,
          options: "-c search_path=" + multiplayerNamespace,
        },
        { schema: multiplayerNamespace },
      ),
    });
    clients.multiplayerUrl = connection;
  }
  const db = clients.multiplayerDb;
  const target = await db.$queryRaw<
    { database: string; schema: string }[]
  >`SELECT current_database() AS database, current_schema() AS schema`;
  if (
    target[0]?.database !== multiplayerNamespace ||
    target[0]?.schema !== multiplayerNamespace
  )
    throw new AccountError(
      "Destino aislado incorrecto. Operación bloqueada.",
      503,
    );
  const marker = await db.$queryRaw<
    { marker: string }[]
  >`SELECT marker FROM "draftory_multiplayer_test"."_MultiplayerGuard" WHERE id = 1`;
  if (marker[0]?.marker !== "DRAFTORY_LOCAL_FIXTURES_V1")
    throw new AccountError("Falta el marcador de instalación aislada.", 503);
  return db;
}
export async function testActor(request: Request, db: PrismaClient) {
  const id = request.headers.get("x-draftory-test-player");
  if (!id || !/^mp-player-(?:[1-9]|10)$/.test(id))
    throw new AccountError("Selecciona una perspectiva de prueba.", 400);
  const user = await db.user.findUnique({
    where: { id },
    select: { username: true, steamId: true },
  });
  if (!user || user.username !== id || user.steamId !== null)
    throw new AccountError(
      "Solo fixtures aislados pueden usar esta herramienta.",
      403,
    );
  return id;
}
export async function scenario(reset = false) {
  const db = await multiplayerDb();
  if (reset)
    await db.$transaction(async (tx) => {
      // Archive only fixtures in this dedicated database. No DROP/TRUNCATE or fake results.
      await tx.readyCheck.updateMany({
        where: { status: { in: ["PENDING", "PASSED"] } },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      await tx.match.updateMany({
        where: { status: "QUEUED" },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
      await tx.room.updateMany({
        where: { phase: { notIn: ["CANCELLED", "FINISHED"] } },
        data: {
          phase: "CANCELLED",
          closedAt: new Date(),
          revision: { increment: 1 },
        },
      });
    });
  const roles = ["CARRY", "MID", "OFFLANE", "SUPPORT", "HARD_SUPPORT"] as const;
  const players = [];
  for (let n = 1; n <= 10; n++) {
    const id = "mp-player-" + n;
    const user = await db.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        username: id,
        displayName: "Test Player " + n,
        profile: {
          create: {
            publicHandle: id,
            country: "Colombia",
            region: "Sudamérica",
            preferredRolePrimary: roles[(n - 1) % roles.length],
            onboardingCompletedAt: new Date(),
          },
        },
        pointWallet: { create: {} },
      },
    });
    if (user.steamId !== null || user.username !== id)
      throw new AccountError(
        "Identidad ajena a los fixtures. Escenario bloqueado.",
        403,
      );
    players.push({ id: user.id, name: user.displayName! });
  }
  const existing = await listRealRooms(players[0].id, db);
  const { room } = await createRealRoom(
    players[0].id,
    {
      name: "Multiplayer Test · 10 jugadores",
      mode: "All Pick",
      region: "Sudamérica",
      formation: "CAPTAINS",
      firstPickMethod: "DICE",
      isPrivate: false,
    },
    db,
  );
  // Only a new scenario auto-populates its fixtures. Reopening never undoes a manual leave.
  if (!existing.some((r) => r.id === room.id))
    for (const player of players.slice(1))
      await roomAction(player.id, room.id, { action: "join" }, db);
  return { players, roomId: room.id };
}
