import "server-only";
import { decryptLobbyCredentials } from "../../../apps/dota-worker/credential-envelope.mjs";
import { prisma } from "../prisma";
import { AccountError } from "./http";
import { reserveRequestBudget } from "./request-budget";

type Binding = {
  id: string;
  lobbyId: string;
  correlationId: string;
  publicName: string | null;
  secretRef: string;
  steamId: string;
  team: string;
  slot: number;
  mode: string;
  region: string;
  credentialsEnvelope: unknown;
  availability: "CONFIRMED" | "RECHECK_REQUIRED";
};
const reads = new Map<string, number>();
let activeReads = 0;
async function localSecret(
  binding: Binding,
): Promise<{ name: string; password: string; lobbyId: string }> {
  if (process.env.DRAFTORY_ENABLE_DOTA_LOBBY_ACCESS !== "true")
    throw new AccountError(
      "El acceso manual privado no está configurado en este servidor.",
      503,
    );
  try {
    return decryptLobbyCredentials(binding, binding.credentialsEnvelope);
  } catch {
    throw new AccountError(
      "Los datos de acceso no están disponibles. No se creará otro lobby.",
      409,
    );
  }
}
async function authorize(
  userId: string,
  roomId: string,
  db = prisma,
): Promise<Binding> {
  const rows = await db.$queryRaw<
    Binding[]
  >`SELECT l.id,l."lobbyId",l."correlationId",to_jsonb(l)->>'publicName' AS "publicName",to_jsonb(l)->'credentialsEnvelope' AS "credentialsEnvelope",w."secretRef",w."steamId",p.team,p.slot,m.mode,m.region,
    CASE WHEN l.state='CONFIRMED' AND w."heartbeatAt">now()-interval '30 seconds' THEN 'CONFIRMED' ELSE 'RECHECK_REQUIRED' END AS availability
    FROM "DotaLobby" l JOIN "DotaWorker" w ON w.id=l."workerId" JOIN "Match" m ON m.id=l."matchId"
    JOIN "Room" r ON r.id=m."roomId" JOIN "DotaLobbyPlayer" p ON p."lobbyId"=l.id
    JOIN "RoomMember" rm ON rm."roomId"=r.id AND rm."userId"=p."userId"
    WHERE r.id=${roomId} AND p."userId"=${userId} AND rm."leftAt" IS NULL
      AND r.phase IN ('WAITING_FOR_PLAYERS','IN_GAME') AND m.status IN ('QUEUED','IN_PROGRESS') AND l.state IN ('CONFIRMED','RECONCILING')
      AND l."gcConfirmedAt" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "DotaJob" j WHERE j."lobbyId"=l.id AND j.kind='INVITE_PLAYERS' AND j."idempotencyKey"='invite:'||l.id::text||':'||p."userId")
      AND EXISTS (SELECT 1 FROM "DotaJob" j WHERE j."lobbyId"=l.id AND j.kind='CREATE_LOBBY' AND j.status='SUCCEEDED')`;
  if (rows.length !== 1 || !rows[0].lobbyId)
    throw new AccountError(
      "Acceso reservado a los participantes de un intento vigente con lobby confirmado.",
      403,
    );
  return rows[0];
}
export async function readLobbyAccess(
  userId: string,
  roomId: string,
  db = prisma,
  reader = localSecret,
) {
  const binding = await authorize(userId, roomId, db);
  await reserveRequestBudget("lobby-access", userId, 12, 60000);
  const now = Date.now();
  for (const [id, time] of reads) if (now - time > 30000) reads.delete(id);
  if (
    activeReads >= 4 ||
    reads.size >= 1000 ||
    now - (reads.get(userId) ?? 0) < 5000
  )
    throw new AccountError(
      "Espera unos segundos antes de consultar el acceso nuevamente.",
      429,
    );
  reads.set(userId, now);
  activeReads++;
  try {
    const credentials = await reader(binding);
    // Recheck cancellation, roster and transport after the private read.
    const current = await authorize(userId, roomId, db);
    if (JSON.stringify(binding) !== JSON.stringify(current))
      throw new AccountError(
        "El lobby cambió. Vuelve a consultar el acceso.",
        409,
      );
    return {
      ...credentials,
      team: binding.team,
      slot: binding.slot,
      mode: binding.mode,
      region: binding.region,
      availability: binding.availability,
    };
  } finally {
    activeReads--;
  }
}
export async function checkLobbyAccess(
  userId: string,
  roomId: string,
  db = prisma,
) {
  const b = await authorize(userId, roomId, db);
  return { lobbyId: b.lobbyId, availability: b.availability };
}
