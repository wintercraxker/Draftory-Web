import "server-only";
import { readStoredMedals } from "./stored-hover-medals";
import { getXpProgress } from "../competitive";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { AccountError } from "./errors";
import { resolveDisplayAvatar } from "../display-avatar";
import type {
  ClanDetail,
  ClanFeed,
  ClanSummary,
  ClanJoinRequest,
  ClanMember,
} from "../clans";
type Tx = Prisma.TransactionClient;
export async function clansInstalled(db: Pick<Tx, "$queryRaw"> = prisma) {
  const [r] = await db.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass(current_schema() || '."ClanEvent"') IS NOT NULL ready`;
  return r.ready;
}
export function clanFields(input: Record<string, unknown>) {
  const raw = typeof input.name === "string" ? input.name : "",
    tagRaw = typeof input.tag === "string" ? input.tag : "";
  if (
    /[\p{Cc}\p{Cf}]/u.test(raw + tagRaw) ||
    raw.length > 128 ||
    tagRaw.length > 32
  )
    throw new AccountError("Nombre o siglas no válidos.");
  const name = raw.normalize("NFKC").trim().replace(/\s+/gu, " "),
    tag = tagRaw.normalize("NFKC").trim().toUpperCase();
  if (
    Array.from(name).length < 3 ||
    Array.from(name).length > 32 ||
    !/^([\p{Script=Latin}0-9][\p{Script=Latin}\p{M}0-9 '\-]*[\p{Script=Latin}\p{M}0-9]|[\p{Script=Latin}0-9]{3,})$/u.test(
      name,
    )
  )
    throw new AccountError(
      "Nombre: utiliza entre 3 y 32 letras latinas, números, espacios, guiones o apóstrofos.",
    );
  if (!/^[A-Z0-9]{1,6}$/.test(tag))
    throw new AccountError("Siglas: utiliza entre 1 y 6 letras A–Z o números.");
  if (input.description !== undefined && typeof input.description !== "string")
    throw new AccountError("Descripción no válida.");
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 280 || /[<>\p{Cc}\p{Cf}]/u.test(description))
    throw new AccountError(
      "Descripción: máximo 280 caracteres, sin etiquetas ni controles.",
    );
  return {
    name,
    nameKey: name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(),
    tag,
    description,
  };
}
async function eligible(tx: Tx, userId: string) {
  const [u] = await tx.$queryRaw<
    { id: string }[]
  >`SELECT u.id FROM "User" u JOIN "Profile" p ON p."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id WHERE u.id=${userId} AND p."onboardingCompletedAt" IS NOT NULL AND l."deletedAt" IS NULL`;
  if (!u) throw new AccountError("Jugador no disponible.", 404);
}
async function activeMembership(tx: Tx, userId: string) {
  const [m] = await tx.$queryRaw<
    { clanId: string; role: string }[]
  >`SELECT "clanId",role FROM "ClanMembership" WHERE "userId"=${userId} AND "leftAt" IS NULL`;
  return m;
}
async function notify(
  tx: Tx,
  event: string,
  users: string[],
  description: string,
  clanId: string,
) {
  for (const user of new Set(users))
    await tx.$executeRaw`INSERT INTO "Notification" (id,"userId",type,payload,"createdAt") VALUES (${"clan:" + event + ":" + user},${user},'CLAN',${JSON.stringify({ description, href: "/clan/" + clanId })}::jsonb,clock_timestamp()) ON CONFLICT(id) DO NOTHING`;
}
export async function clanCommand(
  actor: string,
  input: Record<string, unknown>,
  shield?: Uint8Array,
  db = prisma,
) {
  const action = String(input.action ?? ""),
    requestId = String(input.requestId ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new AccountError("Identificador de operación no válido.");
  const properties: Record<string, string[]> = {
    create: ["name", "tag", "description"],
    edit: ["clanId", "name", "tag", "description", "removeShield"],
    invite: ["clanId", "publicId"],
    apply: ["clanId"],
    accept: ["clanId", "id"],
    reject: ["clanId", "id"],
    leave: ["clanId"],
    kick: ["clanId", "userId"],
    role: ["clanId", "userId", "role"],
    transfer: ["clanId", "userId"],
    disband: ["clanId", "confirm"],
  };
  const allowed = Object.keys(properties);
  if (!allowed.includes(action)) throw new AccountError("Acción no válida.");
  if (
    Object.keys(input).some(
      (key) => !["action", "requestId", ...properties[action]].includes(key),
    )
  )
    throw new AccountError("Campos no permitidos para esta acción.");
  for (const key of [
    "action",
    "requestId",
    "clanId",
    "publicId",
    "id",
    "userId",
    "role",
  ])
    if (input[key] !== undefined && typeof input[key] !== "string")
      throw new AccountError("Campos de identidad no válidos.");
  if (input.confirm !== undefined && typeof input.confirm !== "boolean")
    throw new AccountError("Confirmación no válida.");
  const fields = ["create", "edit"].includes(action) ? clanFields(input) : null;
  if (
    input.removeShield !== undefined &&
    (typeof input.removeShield !== "boolean" || action !== "edit" || shield)
  )
    throw new AccountError("Cambio de escudo no válido.");
  if (shield && !fields)
    throw new AccountError(
      "El escudo solo puede cambiarse al crear o editar el clan.",
    );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .update(shield ?? new Uint8Array())
    .digest("hex");
  try {
    return await db.$transaction(
      async (tx) => {
        if (!(await clansInstalled(tx)))
          throw new AccountError(
            "Los clanes están pendientes de activación.",
            503,
          );
        // A short, database-wide clan write gate prevents cross-clan membership/request
        // deadlocks. No image processing or external requests occur under this lock.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(726198,119)::text`;
        const [previous] = await tx.$queryRaw<
          { fingerprint: string; result: unknown }[]
        >`SELECT fingerprint,result FROM "ClanEvent" WHERE "actorId"=${actor} AND "requestId"=${requestId}::uuid`;
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new AccountError(
              "La operación ya se utilizó con otros datos.",
              409,
            );
          return previous.result;
        }
        await eligible(tx, actor);
        let clanId = String(input.clanId ?? ""),
          recipients: string[] = [],
          message = "",
          affected: string[] = [actor];
        const eventId = randomUUID();
        if (action === "create") {
          if (await activeMembership(tx, actor))
            throw new AccountError("Ya perteneces a un clan.", 409);
          clanId = randomUUID();
          const f = fields!;
          await tx.$executeRaw`INSERT INTO "Clan"(id,name,"nameKey",tag,"tagKey",description,"leaderId",shield,"shieldVersion") VALUES (${clanId}::uuid,${f.name},${f.nameKey},${f.tag},${f.tag},${f.description},${actor},${shield ?? null},${shield ? randomUUID() : null}::uuid)`;
          await tx.$executeRaw`INSERT INTO "ClanMembership"(id,"clanId","userId",role) VALUES (${randomUUID()}::uuid,${clanId}::uuid,${actor},'LEADER')`;
          await tx.$executeRaw`UPDATE "ClanRequest" SET state='INVALIDATED',"resolvedAt"=clock_timestamp() WHERE "userId"=${actor} AND state='PENDING'`;
        } else {
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              clanId,
            )
          )
            throw new AccountError("Clan no válido.");
          const [clan] = await tx.$queryRaw<
            { id: string; name: string; leaderId: string }[]
          >`SELECT id,name,"leaderId" FROM "Clan" WHERE id=${clanId}::uuid AND "disbandedAt" IS NULL FOR UPDATE`;
          if (!clan) throw new AccountError("Clan no disponible.", 404);
          const membership = await activeMembership(tx, actor),
            own = membership?.clanId === clanId,
            leader = own && membership?.role === "LEADER",
            admin = own && ["LEADER", "OFFICER"].includes(membership!.role);
          const members = await tx.$queryRaw<
            { userId: string; role: string }[]
          >`SELECT "userId",role FROM "ClanMembership" WHERE "clanId"=${clanId}::uuid AND "leftAt" IS NULL ORDER BY "userId"`;
          affected = members.map((m) => m.userId);
          if (
            ["edit", "transfer", "disband", "role"].includes(action) &&
            !leader
          )
            throw new AccountError(
              "Solo el líder puede realizar esta acción.",
              403,
            );
          if (["invite", "kick"].includes(action) && !admin)
            throw new AccountError(
              "Necesitas permisos de administración del clan.",
              403,
            );
          if (action === "edit") {
            const f = fields!;
            await tx.$executeRaw`UPDATE "Clan" SET name=${f.name},"nameKey"=${f.nameKey},tag=${f.tag},"tagKey"=${f.tag},description=${f.description},"updatedAt"=clock_timestamp() WHERE id=${clanId}::uuid`;
            if (shield)
              await tx.$executeRaw`UPDATE "Clan" SET shield=${shield},"shieldVersion"=${randomUUID()}::uuid WHERE id=${clanId}::uuid`;
            if (input.removeShield === true)
              await tx.$executeRaw`UPDATE "Clan" SET shield=NULL,"shieldVersion"=NULL WHERE id=${clanId}::uuid`;
            recipients = affected;
            message = "Se actualizó la identidad de tu clan.";
          } else if (action === "invite" || action === "apply") {
            if (members.length >= 10)
              throw new AccountError("El clan está completo (10 / 10).", 409);
            const [pending] = await tx.$queryRaw<
              { n: number }[]
            >`SELECT count(*)::int n FROM "ClanRequest" WHERE "clanId"=${clanId}::uuid AND state='PENDING'`;
            if (pending.n >= 100)
              throw new AccountError(
                "Resuelve las invitaciones y solicitudes pendientes antes de añadir más.",
                409,
              );
            let target = actor;
            if (action === "invite") {
              const publicId = String(input.publicId ?? "")
                .trim()
                .toUpperCase();
              if (!/^DF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(publicId))
                throw new AccountError("Indica un DF-ID válido.");
              const [u] = await tx.$queryRaw<
                { userId: string }[]
              >`SELECT d."userId" FROM "DraftoryIdentity" d JOIN "Profile" p ON p."userId"=d."userId" LEFT JOIN "AccountLifecycle" l ON l."userId"=d."userId" WHERE d."publicId"=${publicId} AND p.visibility='PUBLIC' AND l."deletedAt" IS NULL AND p."onboardingCompletedAt" IS NOT NULL`;
              if (!u) throw new AccountError("Jugador no disponible.", 404);
              target = u.userId;
            }
            await eligible(tx, target);
            if (await activeMembership(tx, target))
              throw new AccountError("El jugador ya pertenece a un clan.", 409);
            await tx.$executeRaw`INSERT INTO "ClanRequest"(id,"clanId","userId",kind,"createdById") VALUES (${randomUUID()}::uuid,${clanId}::uuid,${target},${action === "invite" ? "INVITE" : "APPLICATION"},${actor})`;
            affected.push(target);
            recipients =
              action === "invite"
                ? [target]
                : members
                    .filter((m) => m.role !== "MEMBER")
                    .map((m) => m.userId);
            message =
              action === "invite"
                ? "Has recibido una invitación para unirte a " + clan.name + "."
                : "Tu clan tiene una nueva solicitud de ingreso.";
          } else if (action === "accept" || action === "reject") {
            const id = String(input.id ?? "");
            if (
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                id,
              )
            )
              throw new AccountError("Solicitud no válida.");
            const [r] = await tx.$queryRaw<
              {
                id: string;
                userId: string;
                kind: string;
                createdById: string;
                state: string;
              }[]
            >`SELECT id,"userId",kind,"createdById",state FROM "ClanRequest" WHERE id=${id}::uuid AND "clanId"=${clanId}::uuid FOR UPDATE`;
            if (!r) throw new AccountError("Solicitud no disponible.", 404);
            if (
              r.kind === "INVITE"
                ? r.userId !== actor && (action === "accept" || !admin)
                : !admin
            )
              throw new AccountError(
                "No puedes responder a esta solicitud.",
                403,
              );
            if (r.state !== "PENDING")
              throw new AccountError("La solicitud ya fue resuelta.", 409);
            if (action === "accept") {
              await eligible(tx, r.userId);
              if (await activeMembership(tx, r.userId))
                throw new AccountError(
                  "El jugador ya pertenece a un clan.",
                  409,
                );
              if (members.length >= 10)
                throw new AccountError("El clan está completo (10 / 10).", 409);
              await tx.$executeRaw`INSERT INTO "ClanMembership"(id,"clanId","userId",role) VALUES (${randomUUID()}::uuid,${clanId}::uuid,${r.userId},'MEMBER')`;
              await tx.$executeRaw`UPDATE "ClanRequest" SET state='INVALIDATED',"resolvedAt"=clock_timestamp() WHERE "userId"=${r.userId} AND state='PENDING' AND id<>${id}::uuid`;
            }
            await tx.$executeRaw`UPDATE "ClanRequest" SET state=${action === "accept" ? "ACCEPTED" : r.kind === "INVITE" && r.userId !== actor ? "INVALIDATED" : "REJECTED"},"resolvedAt"=clock_timestamp() WHERE id=${id}::uuid`;
            affected.push(r.userId);
            recipients = [r.userId, r.createdById, clan.leaderId];
            message =
              action === "accept"
                ? "Se aceptó un ingreso a " + clan.name + "."
                : "Se rechazó una invitación o solicitud de " + clan.name + ".";
          } else if (action === "leave" || action === "kick") {
            const target =
                action === "leave" ? actor : String(input.userId ?? ""),
              m = members.find((m) => m.userId === target);
            if (!m) throw new AccountError("Miembro no disponible.", 404);
            if (m.role === "LEADER")
              throw new AccountError(
                "El líder debe transferir el liderazgo o disolver el clan.",
                409,
              );
            if (
              action === "kick" &&
              (target === actor || (!leader && m.role !== "MEMBER"))
            )
              throw new AccountError(
                "No puedes expulsar a este integrante.",
                403,
              );
            await tx.$executeRaw`UPDATE "ClanMembership" SET "leftAt"=clock_timestamp() WHERE "userId"=${target} AND "clanId"=${clanId}::uuid AND "leftAt" IS NULL`;
            recipients = [target, clan.leaderId];
            message =
              action === "kick"
                ? "Has sido retirado de " + clan.name + "."
                : "Un integrante abandonó " + clan.name + ".";
          } else if (action === "role" || action === "transfer") {
            const target = String(input.userId ?? ""),
              m = members.find((m) => m.userId === target);
            if (!m || m.role === "LEADER")
              throw new AccountError("Selecciona otro integrante.");
            if (action === "role") {
              const role = String(input.role ?? "");
              if (!["MEMBER", "OFFICER"].includes(role))
                throw new AccountError("Rol no válido.");
              await tx.$executeRaw`UPDATE "ClanMembership" SET role=${role} WHERE "userId"=${target} AND "clanId"=${clanId}::uuid AND "leftAt" IS NULL`;
            } else {
              await tx.$executeRaw`UPDATE "ClanMembership" SET role='OFFICER' WHERE "userId"=${actor} AND "clanId"=${clanId}::uuid AND "leftAt" IS NULL`;
              await tx.$executeRaw`UPDATE "ClanMembership" SET role='LEADER' WHERE "userId"=${target} AND "clanId"=${clanId}::uuid AND "leftAt" IS NULL`;
              await tx.$executeRaw`UPDATE "Clan" SET "leaderId"=${target} WHERE id=${clanId}::uuid`;
            }
            recipients = affected;
            message =
              action === "transfer"
                ? "Se transfirió el liderazgo de tu clan."
                : "Se actualizaron los permisos de un integrante.";
          } else if (action === "disband") {
            if (input.confirm !== true)
              throw new AccountError("Confirma la disolución del clan.");
            const pendingUsers = await tx.$queryRaw<
              { userId: string }[]
            >`SELECT DISTINCT "userId" FROM "ClanRequest" WHERE "clanId"=${clanId}::uuid AND state='PENDING'`;
            await tx.$executeRaw`UPDATE "ClanMembership" SET "leftAt"=clock_timestamp() WHERE "clanId"=${clanId}::uuid AND "leftAt" IS NULL`;
            await tx.$executeRaw`UPDATE "ClanRequest" SET state='INVALIDATED',"resolvedAt"=clock_timestamp() WHERE "clanId"=${clanId}::uuid AND state='PENDING'`;
            await tx.$executeRaw`UPDATE "Clan" SET "disbandedAt"=clock_timestamp() WHERE id=${clanId}::uuid`;
            recipients = [...affected, ...pendingUsers.map((r) => r.userId)];
            message =
              "Se disolvió " +
              clan.name +
              ". Tu identidad de jugador se conserva.";
          }
        }
        await tx.$executeRaw`UPDATE "Clan" SET "updatedAt"=clock_timestamp() WHERE id=${clanId}::uuid`;
        if (
          [
            "create",
            "edit",
            "invite",
            "apply",
            "accept",
            "leave",
            "kick",
            "transfer",
            "disband",
          ].includes(action)
        ) {
          // Version account rows alongside membership changes. Serializable account
          // erasure retries if it waited on the clan gate with an older snapshot.
          const users = [...new Set(affected)];
          if (users.length)
            await tx.$executeRaw(
              Prisma.sql`UPDATE "User" SET "updatedAt"=clock_timestamp() WHERE id IN (${Prisma.join(users)})`,
            );
        }
        const result = { ok: true, clanId };
        const details = fields
          ? {
              ...fields,
              ...(input.removeShield === true ? { removeShield: true } : {}),
            }
          : Object.fromEntries(
              Object.entries(input).filter(
                ([key]) => properties[action].includes(key) && key !== "clanId",
              ),
            );
        await tx.$executeRaw`INSERT INTO "ClanEvent"(id,"clanId","actorId","requestId",kind,fingerprint,details,result) VALUES (${eventId}::uuid,${clanId}::uuid,${actor},${requestId}::uuid,${action},${fingerprint},${JSON.stringify(details)}::jsonb,${JSON.stringify(result)}::jsonb)`;
        if (message) await notify(tx, eventId, recipients, message, clanId);
        return result;
      },
      { maxWait: 10000, timeout: 15000 },
    );
  } catch (e) {
    if (e instanceof AccountError) throw e;
    const error = e as {
      code?: string;
      meta?: {
        code?: string;
        driverAdapterError?: { cause?: { originalCode?: string } };
      };
    };
    const code =
      error.meta?.driverAdapterError?.cause?.originalCode ??
      error.meta?.code ??
      error.code;
    if (["23505", "P2002"].includes(code ?? ""))
      throw new AccountError(
        "Las siglas, el nombre o la solicitud ya están en uso.",
        409,
      );
    throw e;
  }
}
const summarySql = Prisma.sql`SELECT c.id,c.name,c.tag,c."shieldVersion",count(m.id)::int count FROM "Clan" c LEFT JOIN "ClanMembership" m ON m."clanId"=c.id AND m."leftAt" IS NULL`;
type SummaryRow = {
  id: string;
  name: string;
  tag: string;
  shieldVersion: string | null;
  count: number;
};
function summary(r: SummaryRow): ClanSummary {
  return {
    id: r.id,
    name: r.name,
    tag: r.tag,
    count: r.count,
    shield: r.shieldVersion
      ? "/api/clans/" + r.id + "/shield?v=" + r.shieldVersion
      : null,
  };
}
export async function readClan(
  actor: string,
  id: string,
  db = prisma,
): Promise<ClanDetail> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new AccountError("Clan no válido.");
  return db.$transaction(
    async (tx) => {
      if (!(await clansInstalled(tx)))
        throw new AccountError(
          "Los clanes están pendientes de activación.",
          503,
        );
      const [c] = await tx.$queryRaw<
        (SummaryRow & {
          description: string;
          createdAt: Date;
          leaderId: string;
        })[]
      >(
        Prisma.sql`${summarySql} WHERE c.id=${id}::uuid AND c."disbandedAt" IS NULL GROUP BY c.id`,
      );
      if (!c) throw new AccountError("Clan no disponible.", 404);
      const [details] = await tx.$queryRaw<
        { description: string; createdAt: Date; leaderId: string }[]
      >`SELECT description,"createdAt","leaderId" FROM "Clan" WHERE id=${id}::uuid`;
      const rows = await tx.$queryRaw<
        {
          id: string;
          name: string;
          publicId: string | null;
          avatar: string | null;
          customAvatarUrl: string | null;
          role: ClanMember["role"];
          preferredRole: string;
          xp: bigint;
          visibility: string;
          handle: string;
          deleted: boolean;
        }[]
      >`SELECT u.id,COALESCE(NULLIF(u."displayName",''),'Jugador de Steam') name,d."publicId",u.avatar,u."customAvatarUrl",m.role,p."preferredRolePrimary"::text "preferredRole",p.xp,p.visibility,p."publicHandle" handle,(l."deletedAt" IS NOT NULL) deleted FROM "ClanMembership" m JOIN "User" u ON u.id=m."userId" JOIN "Profile" p ON p."userId"=u.id LEFT JOIN "DraftoryIdentity" d ON d."userId"=u.id LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id WHERE m."clanId"=${id}::uuid AND m."leftAt" IS NULL ORDER BY CASE m.role WHEN 'LEADER' THEN 0 WHEN 'OFFICER' THEN 1 ELSE 2 END,m."joinedAt",u.id`;
      const viewerRole = rows.find((r) => r.id === actor)?.role ?? null;
      const medals = await readStoredMedals(
        actor,
        rows
          .filter(
            (r) => !r.deleted && (r.visibility === "PUBLIC" || r.id === actor),
          )
          .map((r) => r.id),
        tx,
      );
      const members: ClanMember[] = rows.map((r) => {
        const visible =
          !r.deleted && (r.visibility === "PUBLIC" || r.id === actor);
        return {
          id:
            visible || viewerRole === "LEADER" || viewerRole === "OFFICER"
              ? r.id
              : "private-" + rows.indexOf(r),
          name: visible ? r.name : "Jugador privado",
          level: visible ? getXpProgress(r.xp).level : null,
          medal: visible ? (medals[r.id] ?? null) : null,
          publicId: visible ? r.publicId : null,
          avatar: visible ? (resolveDisplayAvatar(r) ?? null) : null,
          role: r.role,
          preferredRole: visible ? r.preferredRole : null,
          href: visible
            ? r.id === actor
              ? "/perfil"
              : "/profile/" + encodeURIComponent(r.handle || r.id)
            : null,
        };
      });
      const requests = ["LEADER", "OFFICER"].includes(viewerRole ?? "")
        ? await requestList(tx, actor, id)
        : [];
      const [ownRequest] = await tx.$queryRaw<
        { kind: "INVITE" | "APPLICATION" }[]
      >`SELECT kind FROM "ClanRequest" WHERE "clanId"=${id}::uuid AND "userId"=${actor} AND state='PENDING' LIMIT 1`;
      return {
        viewerRequest: ownRequest?.kind ?? null,
        ...summary(c),
        ...details,
        leaderId: members.find((m) => m.role === "LEADER")?.id ?? "unavailable",
        createdAt: details.createdAt.toISOString(),
        members,
        viewerRole,
        requests,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
async function requestList(
  tx: Tx,
  actor: string,
  clanId?: string,
): Promise<ClanJoinRequest[]> {
  const rows = await tx.$queryRaw<
    (Omit<ClanJoinRequest, "createdAt"> & {
      createdAt: Date;
      visibility: string;
    })[]
  >(
    Prisma.sql`SELECT r.id,r."clanId",c.name "clanName",c.tag,r."userId",r.kind,r."createdAt",CASE WHEN p.visibility='PUBLIC' OR r."userId"=${actor} THEN COALESCE(NULLIF(u."displayName",''),'Jugador de Steam') ELSE 'Jugador privado' END name,CASE WHEN p.visibility='PUBLIC' OR r."userId"=${actor} THEN d."publicId" ELSE NULL END "publicId" FROM "ClanRequest" r JOIN "Clan" c ON c.id=r."clanId" JOIN "User" u ON u.id=r."userId" JOIN "Profile" p ON p."userId"=u.id LEFT JOIN "DraftoryIdentity" d ON d."userId"=u.id WHERE r.state='PENDING' AND c."disbandedAt" IS NULL AND ${clanId ? Prisma.sql`r."clanId"=${clanId}::uuid` : Prisma.sql`r."userId"=${actor} AND r.kind='INVITE'`} ORDER BY r."createdAt" DESC LIMIT 50`,
  );
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
export async function readClans(
  actor: string,
  query = "",
  page = 1,
  db = prisma,
): Promise<ClanFeed> {
  if (!(await clansInstalled(db)))
    return {
      enabled: false,
      mine: null,
      invitations: [],
      items: [],
      page: 1,
      hasMore: false,
    };
  const p = Math.max(1, Math.min(1000, Math.floor(page) || 1)),
    q = query.trim().slice(0, 64).replace(/[\%_]/g, "");
  const rows = await db.$queryRaw<SummaryRow[]>(
    Prisma.sql`${summarySql} WHERE c."disbandedAt" IS NULL AND (c.name ILIKE ${"%" + q + "%"} OR c.tag ILIKE ${"%" + q + "%"}) GROUP BY c.id ORDER BY c."createdAt" DESC,c.id LIMIT 13 OFFSET ${(p - 1) * 12}`,
  );
  const mine = await activeMembership(db, actor);
  return {
    enabled: true,
    mine: mine ? await readClan(actor, mine.clanId, db) : null,
    invitations: await requestList(db, actor),
    items: rows.slice(0, 12).map(summary),
    page: p,
    hasMore: rows.length > 12,
  };
}
export async function clanIdentities(
  actor: string,
  ids: string[],
  db: Pick<Tx, "$queryRaw"> = prisma,
): Promise<Record<string, ClanSummary>> {
  if (!ids.length || !(await clansInstalled(db))) return {};
  const refs = [...new Set(ids)]
    .filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id))
    .slice(0, 100);
  if (!refs.length) return {};
  const rows = await db.$queryRaw<
    (SummaryRow & { userId: string; publicId: string | null })[]
  >(
    Prisma.sql`SELECT u.id "userId",df."publicId",c.id,c.name,c.tag,c."shieldVersion",count(m.id)::int count FROM "Clan" c LEFT JOIN "ClanMembership" m ON m."clanId"=c.id AND m."leftAt" IS NULL CROSS JOIN "User" u LEFT JOIN "DraftoryIdentity" df ON df."userId"=u.id JOIN "Profile" p ON p."userId"=u.id JOIN "ClanMembership" mine ON mine."userId"=u.id AND mine."leftAt" IS NULL LEFT JOIN "AccountLifecycle" l ON l."userId"=u.id WHERE mine."clanId"=c.id AND (u.id IN (${Prisma.join(refs)}) OR df."publicId" IN (${Prisma.join(refs)})) AND (p.visibility='PUBLIC' OR u.id=${actor}) AND l."deletedAt" IS NULL AND c."disbandedAt" IS NULL GROUP BY c.id,u.id,df."publicId"`,
  );
  // u.id needs to be selected separately from the reusable summary projection.
  return Object.fromEntries(
    rows.flatMap((r) =>
      [r.userId, r.publicId]
        .filter((ref): ref is string => !!ref && refs.includes(ref))
        .map((ref) => [ref, summary(r)]),
    ),
  );
}
