import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { requirePermission } from "./staff-access";
import { AccountError } from "./errors";
import { botActions, botEvents, type BotAction } from "../bot-console-catalog";
import { readBotCapacity } from "../../../apps/dota-worker/shared-health.mjs";
import { competitiveAdmissionOpen } from "../../../apps/dota-worker/attempt-authorization.mjs";

type Health = {
  reference: string;
  state: string;
  idleOnly: boolean;
  heartbeatAt: Date | null;
};
type Worker = {
  id: string;
  reference: string;
  enabled: boolean;
  heartbeatAt: Date | null;
  observedAt: Date | null;
  supervisorAt: Date | null;
  steamConnected: boolean | null;
  gcConnected: boolean | null;
  supervisorActive: boolean | null;
  workerActive: boolean | null;
  draining: boolean | null;
  lobbyState: string | null;
  lobbyReference: string | null;
  activity: string | null;
};
type Event = {
  id: string;
  reference: string;
  code: string;
  severity: string;
  createdAt: Date;
  details: unknown;
};
type Command = {
  id: string;
  reference: string;
  action: BotAction;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  resultCode: string | null;
};
type ReadDb = Pick<typeof prisma, "$queryRaw" | "$queryRawUnsafe">;
async function consoleReady(db: ReadDb = prisma) {
  const [row] = await db.$queryRaw<
    Array<{ ready: boolean }>
  >`SELECT to_regclass(current_schema()||'."DotaBotCommand"') IS NOT NULL AND to_regclass(current_schema()||'."DotaBotEvent"') IS NOT NULL AS ready`;
  return row?.ready === true;
}
export async function staffBots(userId: string, query: URLSearchParams) {
  const access = await requirePermission(userId, "audit.view");
  if (access.role !== "OWNER")
    throw new AccountError("La consola de bots es exclusiva de OWNER.", 403);
  const reference = query.get("bot") || "",
    severity = query.get("severity") || "",
    category = query.get("category") || "",
    search = (query.get("q") || "").trim();
  if (search.length > 80)
    throw new AccountError("La bÃºsqueda admite hasta 80 caracteres.");
  if (reference && !/^bot-0[123]$/.test(reference))
    throw new AccountError("Bot no vÃ¡lido.");
  if (severity && !["INFO", "WARN", "ERROR"].includes(severity))
    throw new AccountError("Severidad no vÃ¡lida.");
  if (
    category &&
    !Object.values(botEvents).some((e) => e.category === category)
  )
    throw new AccountError("CategorÃ­a no vÃ¡lida.");
  const page = Number(query.get("page") || 1),
    day = query.get("date") || "";
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    (day && !/^\d{4}-\d{2}-\d{2}$/.test(day))
  )
    throw new AccountError("Filtro no vÃ¡lido.");
  const from = day
    ? new Date(day + "T00:00:00Z")
    : new Date(Date.now() - 30 * 86400000);
  if (!Number.isFinite(from.getTime()))
    throw new AccountError("Fecha no vÃ¡lida.");
  const to = day
    ? new Date(from.getTime() + 86400000)
    : new Date(Date.now() + 86400000);
  const codes = Object.entries(botEvents)
    .filter(
      ([code, e]) =>
        (!category || e.category === category) &&
        (!search ||
          [code, e.title, e.explanation, e.solution]
            .join(" ")
            .toLocaleLowerCase("es")
            .includes(search.toLocaleLowerCase("es"))),
    )
    .map(([code]) => code);
  // Prisma's raw timestamptz decoding must see UTC even on a Windows database
  // configured with a local timezone. Scope this setting to this read only.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      const [ready, health, workers] = await Promise.all([
        consoleReady(tx),
        readBotCapacity({
          query: async (sql: string, args: unknown[] = []) => ({
            rows: await tx.$queryRawUnsafe<Health[]>(sql, ...args),
          }),
        }),
        tx.$queryRaw<Worker[]>`
    SELECT w.id,w."secretRef" reference,w.enabled,w."heartbeatAt",h."observedAt",h."supervisorAt",h."steamConnected",h."gcConnected",h."supervisorActive",h."workerActive",h.draining,
    (SELECT l.state FROM "DotaLobby" l WHERE l."workerId"=w.id AND l.state NOT IN ('CLOSED','FAILED','CANCELLED') ORDER BY l."createdAt" DESC LIMIT 1) "lobbyState",
    (SELECT l."lobbyId" FROM "DotaLobby" l WHERE l."workerId"=w.id AND l.state NOT IN ('CLOSED','FAILED','CANCELLED') ORDER BY l."createdAt" DESC LIMIT 1) "lobbyReference",
    (SELECT j.kind FROM "DotaJob" j WHERE j."workerId"=w.id AND j.status IN ('LEASED','RECONCILE') ORDER BY j."createdAt" DESC LIMIT 1) activity
    FROM "DotaWorker" w LEFT JOIN "DotaWorkerHealth" h ON h."workerId"=w.id WHERE w."secretRef" IN ('bot-01','bot-02','bot-03') ORDER BY w."secretRef"`,
      ]);
      let events: Event[] = [],
        commands: Command[] = [],
        connections: Array<{ reference: string; connectedAt: Date }> = [];
      if (ready)
        [events, commands] = await Promise.all([
          tx.$queryRaw<
            Event[]
          >`SELECT e.id,w."secretRef" reference,e.code,e.severity,e."createdAt",e.details FROM "DotaBotEvent" e JOIN "DotaWorker" w ON w.id=e."workerId" WHERE (${reference}='' OR w."secretRef"=${reference}) AND (${severity}='' OR e.severity=${severity}) AND e.code=ANY(${codes}::text[]) AND e."createdAt">clock_timestamp()-interval '30 days' AND e."createdAt">=${from} AND e."createdAt"<${to} ORDER BY e."createdAt" DESC,e.id DESC LIMIT 26 OFFSET ${(page - 1) * 25}`,
          tx.$queryRaw<
            Command[]
          >`SELECT c.id,w."secretRef" reference,c.action,c.status,c."createdAt",c."updatedAt",c."expiresAt",c."resultCode" FROM "DotaBotCommand" c JOIN "DotaWorker" w ON w.id=c."workerId" WHERE c."createdAt">clock_timestamp()-interval '30 days' AND (${reference}='' OR w."secretRef"=${reference}) ORDER BY c."createdAt" DESC,c.id DESC LIMIT 25`,
        ]);
      if (ready)
        connections = await tx.$queryRaw<
          Array<{ reference: string; connectedAt: Date }>
        >`SELECT w."secretRef" reference,max(e."createdAt") "connectedAt" FROM "DotaBotEvent" e JOIN "DotaWorker" w ON w.id=e."workerId" WHERE e.code IN ('STEAM_CONNECTED','GC_CONNECTED') AND w."secretRef" IN ('bot-01','bot-02','bot-03') GROUP BY w."secretRef"`;
      const now = new Date();
      return {
        schemaReady: ready,
        agentActivationEnabled:
          process.env.DRAFTORY_ENABLE_BOT_ADMIN_AGENT === "true",
        competitiveAdmissionEnabled: competitiveAdmissionOpen(),
        allowedActions:
          process.env.DRAFTORY_DOTA_PLATFORM_AUTOMATION === "true"
            ? Object.keys(botActions)
            : ["RECONNECT", "RESTART", "DRAIN"],
        canCommand:
          access.role === "OWNER" &&
          access.permissions.includes("rooms.moderate"),
        serverNow: now.toISOString(),
        retentionDays: 30,
        bots: ["bot-01", "bot-02", "bot-03"].map((ref) => {
          const w = workers.find((w) => w.reference === ref),
            h = health.find((h: Health) => h.reference === ref);
          const fresh =
            !!w?.observedAt &&
            !!w.heartbeatAt &&
            now.getTime() - new Date(w.heartbeatAt).getTime() >= -1000 &&
            now.getTime() - new Date(w.heartbeatAt).getTime() < 30000 &&
            now.getTime() - new Date(w.observedAt).getTime() >= -1000 &&
            now.getTime() - new Date(w.observedAt).getTime() < 20000;
          return {
            reference: ref,
            registered: !!w,
            enabled: w?.enabled ?? false,
            state: h?.state ?? "UNREGISTERED",
            heartbeatAt: w?.heartbeatAt ?? null,
            observedAt: w?.observedAt ?? null,
            connectedAt:
              connections.find((c) => c.reference === ref)?.connectedAt ?? null,
            supervisorAt: w?.supervisorAt ?? null,
            steam: fresh ? !!w?.steamConnected : null,
            gc: fresh ? !!w?.gcConnected : null,
            supervisor:
              fresh &&
              !!w?.supervisorAt &&
              now.getTime() - new Date(w.supervisorAt).getTime() < 20000
                ? !!w.supervisorActive
                : null,
            worker: fresh ? !!w?.workerActive : null,
            idleOnly: h?.idleOnly ?? true,
            draining: w?.draining ?? false,
            lobbyState: w?.lobbyState ?? null,
            lobbyReference: w?.lobbyReference ?? null,
            activity: w?.activity ?? null,
          };
        }),
        events: events
          .slice(0, 25)
          .map((e) => ({
            ...e,
            ...botEvents[e.code],
            details: safeDetails(e.details),
          })),
        hasNext: events.length > 25,
        commands: commands.map((c) => ({
          ...c,
          status:
            ["REQUESTED", "RECEIVED", "EXECUTING"].includes(c.status) &&
            now.getTime() >= new Date(c.expiresAt).getTime()
              ? "EXPIRED"
              : c.status,
        })),
      };
    },
    { timeout: 10000, maxWait: 5000 },
  );
}
// Defense in depth for older/malformed rows: never forward arbitrary JSON.
export function safeDetails(value: unknown) {
  const out: Record<string, number | boolean> = {};
  if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value))
      if (
        ["durationMs", "attempt", "players", "exitCode", "confirmed"].includes(
          key,
        ) &&
        ((typeof v === "number" && Number.isFinite(v)) ||
          typeof v === "boolean")
      )
        out[key] = v;
  return out;
}
export async function requestBotCommand(
  userId: string,
  input: Record<string, unknown>,
) {
  const access = await requirePermission(userId, "rooms.moderate");
  if (access.role !== "OWNER" || !access.permissions.includes("audit.view"))
    throw new AccountError("La consola de bots es exclusiva de OWNER.", 403);
  if (process.env.DRAFTORY_ENABLE_BOT_ADMIN_AGENT !== "true")
    throw new AccountError(
      "El agente administrativo no estÃ¡ activado. No se ha enviado ninguna orden.",
      409,
    );
  if (!(await consoleReady()))
    throw new AccountError("La migraciÃ³n de la consola estÃ¡ pendiente.", 409);
  const { reference, action, requestId, confirmed } = input;
  if (
    typeof reference !== "string" ||
    !/^bot-0[123]$/.test(reference) ||
    typeof action !== "string" ||
    !Object.hasOwn(botActions, action) ||
    typeof requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    ) ||
    confirmed !== true
  )
    throw new AccountError("Confirma una acciÃ³n y un bot vÃ¡lidos.");
  if (
    process.env.DRAFTORY_DOTA_PLATFORM_AUTOMATION !== "true" &&
    !["RECONNECT", "RESTART", "DRAIN"].includes(action)
  )
    throw new AccountError(
      "Esta acciÃ³n requiere una fase competitiva autorizada; no se liberarÃ¡n reservas desde el diagnÃ³stico.",
      409,
    );
  // Recheck authorization under the same transaction and lock as the request.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('draftory-staff-authorization'))::text`;
    const again = await requirePermission(userId, "rooms.moderate", tx);
    if (again.role !== "OWNER" || !again.permissions.includes("audit.view"))
      throw new AccountError("AutorizaciÃ³n OWNER revocada.", 403);
    const rows = await tx.$queryRaw<
      Array<{ id: string; enabled: boolean }>
    >`SELECT id,enabled FROM "DotaWorker" WHERE "secretRef"=${reference}`;
    if (rows.length !== 1)
      throw new AccountError("El bot no estÃ¡ registrado en esta base.", 409);
    const worker = rows[0];
    const existing = await tx.$queryRaw<
      Array<{ id: string; action: string; workerId: string }>
    >`SELECT id,action,"workerId" FROM "DotaBotCommand" WHERE "actorId"=${userId} AND "requestId"=${requestId}::uuid`;
    if (existing.length) {
      if (existing[0].action !== action || existing[0].workerId !== worker.id)
        throw new AccountError(
          "Identificador reutilizado para otra acciÃ³n.",
          409,
        );
      return { id: existing[0].id, requested: true, replayed: true };
    }
    const busy = await tx.$queryRaw<
      Array<{ busy: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM "DotaLobby" WHERE "workerId"=${worker.id} AND state NOT IN ('CLOSED','FAILED','CANCELLED')) OR EXISTS(SELECT 1 FROM "DotaTerminalCleanup" WHERE "workerId"=${worker.id} AND status<>'CLOSED') OR EXISTS(SELECT 1 FROM "DotaJob" WHERE "workerId"=${worker.id} AND status IN ('LEASED','RECONCILE')) AS busy`;
    if (busy[0]?.busy)
      throw new AccountError(
        "Reserva protegida: hay un lobby, lease o limpieza pendiente. Reconectar no confirma que Dota 2 haya terminado. Conserva el bot conectado para recibir evidencia terminal del GC; no se reiniciarÃ¡ ni liberarÃ¡ sin un recibo de cierre seguro.",
        409,
      );
    const pending = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "DotaBotCommand" WHERE "workerId"=${worker.id} AND (status IN ('RECEIVED','EXECUTING') OR status='REQUESTED' AND "expiresAt">clock_timestamp()) LIMIT 1`;
    if (pending.length)
      throw new AccountError(
        "Ya hay una acciÃ³n pendiente para este bot.",
        409,
      );
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "DotaBotCommand"(id,"workerId","actorId","requestId",action) VALUES(${id}::uuid,${worker.id},${userId},${requestId}::uuid,${action})`;
    await tx.$executeRaw`INSERT INTO "DotaBotEvent"("workerId",code,severity) VALUES(${worker.id},'COMMAND_REQUESTED','INFO')`;
    await tx.staffAuditLog.create({
      data: {
        actorId: userId,
        permission: "rooms.moderate",
        action: "botCommandRequested",
        reason:
          "Solicitud administrativa confirmada; su ejecuciÃ³n exige recibo Windows",
        result: "REQUESTED",
        changes: { commandId: id, reference, action },
      },
    });
    return { id, requested: true, replayed: false };
  });
}
