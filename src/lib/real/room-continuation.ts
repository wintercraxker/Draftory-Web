import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./http";
type Tx = Prisma.TransactionClient;
export async function continuationInstalled(tx: Tx) {
  if (process.env.DRAFTORY_ENABLE_BOT_CONTINUATION !== "true") return false;
  const [r] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(current_schema()||'."DotaRoomContinuation"') IS NOT NULL ready`;
  return r?.ready === true;
}
export async function requestContinuation(
  tx: Tx,
  matchId: string,
  actorId: string | null,
) {
  if (!(await continuationInstalled(tx))) return;
  await tx.$executeRaw`INSERT INTO "DotaRoomContinuation"("roomId","workerId","previousMatchId","requestedById",history)
 SELECT m."roomId",l."workerId",m.id,${actorId},jsonb_build_array(jsonb_build_object('state','WAITING_CLEANUP','at',clock_timestamp(),'actorId',${actorId}::text)) FROM "Match" m JOIN "DotaLobby" l ON l."matchId"=m.id WHERE m.id=${matchId} AND l."workerId" IS NOT NULL ON CONFLICT("previousMatchId") DO NOTHING`;
}
export async function readContinuation(tx: Tx, roomId: string) {
  if (!(await continuationInstalled(tx))) return null;
  await tx.$queryRaw`SELECT draftory_continuation_tick(${roomId})`;
  const [r] = await tx.$queryRaw<
    {
      id: string;
      state: string;
      reference: string;
      expiresAt: Date | null;
      nextMatchId: string | null;
      connected: boolean | null;
    }[]
  >`SELECT c.id,c.state,w."secretRef" reference,c."expiresAt",c."nextMatchId",(w.enabled AND w."heartbeatAt">clock_timestamp()-interval '30 seconds' AND h."observedAt">clock_timestamp()-interval '20 seconds' AND h."supervisorAt">clock_timestamp()-interval '20 seconds' AND h."supervisorActive" AND h."workerActive" AND h."steamConnected" AND h."gcConnected" AND NOT h.draining AND NOT h."idleOnly") connected FROM "DotaRoomContinuation" c JOIN "DotaWorker" w ON w.id=c."workerId" LEFT JOIN "DotaWorkerHealth" h ON h."workerId"=w.id WHERE c."roomId"=${roomId} AND c.state NOT IN ('RELEASED','CONSUMED') ORDER BY c."createdAt" DESC LIMIT 1`;
  return r
    ? {
        id: r.id,
        state: r.state,
        reference: r.reference,
        connected: r.connected === true,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        nextMatchId: r.nextMatchId,
      }
    : null;
}
export async function bindContinuation(
  tx: Tx,
  roomId: string,
  matchId: string,
) {
  const c = await readContinuation(tx, roomId);
  if (!c) return;
  if (c.state !== "RESERVED")
    throw new AccountError(
      c.state === "EXPIRED"
        ? "La reserva de continuación venció. Cancela la continuación antes de elegir otro bot."
        : "El intento anterior aún requiere limpieza. Todavía no puedes reiniciar.",
      409,
    );
  const changed =
    await tx.$executeRaw`UPDATE "DotaRoomContinuation" SET state='BOUND',"nextMatchId"=${matchId},history=history||jsonb_build_array(jsonb_build_object('state','BOUND','matchId',${matchId}::text,'at',clock_timestamp())) WHERE id=${c.id}::uuid AND state='RESERVED' AND "expiresAt">clock_timestamp()`;
  if (changed !== 1)
    throw new AccountError(
      "La reserva de continuación cambió. Actualiza la sala.",
      409,
    );
}
export async function recycleContinuation(tx: Tx, matchId: string) {
  if (!(await continuationInstalled(tx))) return;
  await tx.$executeRaw`UPDATE "DotaRoomContinuation" c SET state=CASE WHEN c."expiresAt">clock_timestamp() THEN 'RESERVED' ELSE 'EXPIRED' END,"nextMatchId"=NULL,history=history||jsonb_build_array(jsonb_build_object('state','READY_CANCELLED','matchId',${matchId}::text,'at',clock_timestamp())) WHERE c."nextMatchId"=${matchId} AND c.state IN ('BOUND','EXPIRED') AND EXISTS(SELECT 1 FROM "Match" m WHERE m.id=${matchId} AND m.status='CANCELLED') AND NOT EXISTS(SELECT 1 FROM "DotaLobby" l JOIN "DotaJob" j ON j."lobbyId"=l.id WHERE l."matchId"=${matchId} AND j."dispatchedAt" IS NOT NULL)`;
}
export async function releaseContinuation(tx: Tx, roomId: string) {
  const c = await readContinuation(tx, roomId);
  if (!c) return;
  if (!["RESERVED", "EXPIRED"].includes(c.state) || c.nextMatchId)
    throw new AccountError(
      "La continuación aún tiene un intento protegido. Cancélalo y espera su cierre seguro.",
      409,
    );
  await tx.$executeRaw`UPDATE "DotaRoomContinuation" SET state='RELEASED',history=history||jsonb_build_array(jsonb_build_object('state','RELEASED','reason','EXPLICIT_ROOM_ACTION','at',clock_timestamp())) WHERE id=${c.id}::uuid`;
}
