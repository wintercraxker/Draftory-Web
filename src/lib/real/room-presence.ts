import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./errors";
import { terminalRoomPhases } from "../rooms/ownership";

type Tx = Prisma.TransactionClient;
const editable = [
  "WAITING",
  "CHOOSING_CAPTAINS",
  "DECIDING_FIRST_PICK",
  "DRAFTING",
  "READY",
];
const bounded = (key: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[key]);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
export function presencePolicy() {
  return {
    heartbeatMs: bounded("DRAFTORY_ROOM_HEARTBEAT_MS", 15000, 10000, 15000),
    graceMs: bounded("DRAFTORY_ROOM_GRACE_MS", 45000, 30000, 120000),
    sweepMs: 5000,
  };
}
export async function presenceInstalled(db: Pick<Tx, "$queryRaw"> = prisma) {
  if (process.env.DRAFTORY_ENABLE_ROOM_PRESENCE !== "true") return false;
  const [row] = await db.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('"RoomPresenceState"') IS NOT NULL AND to_regclass('"RoomPresenceConnection"') IS NOT NULL AS ready`;
  return row.ready;
}
// Prisma raw DateTime decoding of timestamptz depends on the PG session zone.
// Return a UTC timestamp explicitly, matching the existing room access budget.
async function clock(tx: Tx) {
  return (
    await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`
  )[0].now;
}
async function safeEditable(tx: Tx, roomId: string, phase: string) {
  if (!editable.includes(phase)) return false;
  if (
    await tx.readyCheck.findFirst({
      where: { roomId, status: "PENDING" },
      select: { id: true },
    })
  )
    return false;
  // An inconsistent editable phase is not sufficient permission to erase a
  // frozen/externally active roster. Inspect durable attempts and launch fences.
  const match = await tx.match.findFirst({
    where: {
      roomId,
      OR: [
        { status: { in: ["QUEUED", "IN_PROGRESS"] } },
        { dotaMatchId: { not: null } },
        { externalLink: { isNot: null } },
      ],
    },
    select: { id: true },
  });
  if (match) return false;
  const [unsafe] = await tx.$queryRaw<
    { unsafe: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM "DotaLobby" l JOIN "Match" m ON m.id=l."matchId" WHERE m."roomId"=${roomId} AND l.state NOT IN ('CLOSED','CANCELLED','FAILED')) AS unsafe`;
  if (unsafe.unsafe) return false;
  const [installed] = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('"DotaLaunchControl"') IS NOT NULL AS ready`;
  if (installed.ready) {
    const [fence] = await tx.$queryRaw<
      { unsafe: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM "DotaLaunchControl" c JOIN "Match" m ON m.id=c."matchId" WHERE m."roomId"=${roomId} AND c.status IN ('DISPATCHED','STARTED')) AS unsafe`;
    if (fence.unsafe) return false;
  }
  return true;
}
async function ensureState(tx: Tx, roomId: string, now: Date) {
  const deadline = new Date(now.getTime() + presencePolicy().graceMs);
  await tx.roomPresenceState.upsert({
    where: { roomId },
    create: { roomId, graceUntil: deadline, nextCheckAt: deadline },
    update: {},
  });
}
export async function ensurePresenceTracking(tx: Tx, roomId: string) {
  if (await presenceInstalled(tx))
    await ensureState(tx, roomId, await clock(tx));
}
export async function heartbeatPresence(
  userId: string,
  connectionId: string,
  release = false,
  db = prisma,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      connectionId,
    )
  )
    throw new AccountError("Conexión inválida.");
  const policy = presencePolicy();
  if (!(await presenceInstalled(db))) return { enabled: false, ...policy };
  // The authenticated identity is the only input selecting memberships. A
  // heartbeat cannot create/join a membership or displace another player.
  const memberships = await db.roomMember.findMany({
    where: {
      userId,
      leftAt: null,
      room: { phase: { notIn: [...terminalRoomPhases] } },
    },
    select: { roomId: true },
    take: 100,
  });
  for (const { roomId } of memberships)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE`;
      const member = await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (!member || member.leftAt) return;
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      if (
        terminalRoomPhases.includes(
          room.phase as (typeof terminalRoomPhases)[number],
        )
      )
        return;
      const now = await clock(tx);
      await ensureState(tx, roomId, now);
      if (release) {
        // A hint never shortens the durable grace period; F5 and lost beacons are
        // indistinguishable from tab close. Last successful heartbeat is authority.
        return;
      }
      const key = { roomId, userId, connectionId };
      const existing = await tx.roomPresenceConnection.findUnique({
        where: { roomId_userId_connectionId: key },
      });
      if (
        !existing &&
        (await tx.roomPresenceConnection.count({
          where: { roomId, userId, expiresAt: { gt: now } },
        })) >= 16
      )
        throw new AccountError("Demasiadas conexiones de sala.", 429);
      // Prune only obsolete leases for this participant, never membership/history.
      await tx.roomPresenceConnection.deleteMany({
        where: { roomId, userId, expiresAt: { lt: now } },
      });
      await tx.roomPresenceConnection.upsert({
        where: { roomId_userId_connectionId: key },
        create: {
          ...key,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + policy.graceMs),
        },
        update: {
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + policy.graceMs),
        },
      });
    });
  return { enabled: true, ...policy };
}
async function liveIds(tx: Tx, roomId: string, now: Date) {
  return new Set(
    (
      await tx.roomPresenceConnection.findMany({
        where: { roomId, expiresAt: { gt: now }, member: { leftAt: null } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((c) => c.userId),
  );
}

// Caller owns the Room lock. Candidate User locks serialize with room creation
// and preserve the existing one-active-room-per-creator unique index.
async function nextOwner(
  tx: Tx,
  roomId: string,
  oldId: string,
  online: Set<string>,
) {
  const members = await tx.roomMember.findMany({
    where: { roomId, leftAt: null, userId: { in: [...online], not: oldId } },
    include: { user: { select: { profile: { select: { userId: true } } } } },
    orderBy: [{ isCaptain: "desc" }, { joinedAt: "asc" }, { userId: "asc" }],
  });
  for (const member of members) {
    if (
      !member.user.profile ||
      (await tx.accountLifecycle.findFirst({
        where: { userId: member.userId, deletedAt: { not: null } },
        select: { userId: true },
      }))
    )
      continue;
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "User" WHERE id=${member.userId} FOR UPDATE SKIP LOCKED`;
    if (!locked.length) continue;
    if (
      await tx.room.findFirst({
        where: {
          creatorId: member.userId,
          id: { not: roomId },
          phase: { notIn: [...terminalRoomPhases] },
        },
        select: { id: true },
      })
    )
      continue;
    if (
      await tx.playerSanction.findFirst({
        where: {
          userId: member.userId,
          state: "ACTIVE",
          kind: { in: ["SUSPENSION", "PERMANENT"] },
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { id: true },
      })
    )
      continue;
    return member;
  }
  return null;
}
export async function withdrawPresenceMember(
  tx: Tx,
  roomId: string,
  userId: string,
  reason: "leave" | "disconnected",
  now: Date,
) {
  const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
  if (!(await safeEditable(tx, roomId, room.phase)))
    throw new AccountError(
      "El roster del intento está congelado. La desconexión web no cancela Dota.",
      409,
    );
  const member = await tx.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!member || (member.leftAt && room.creatorId !== userId)) return;
  const online = await liveIds(tx, roomId, now);
  online.delete(userId);
  const owner =
    room.creatorId === userId
      ? await nextOwner(tx, roomId, userId, online)
      : null;
  if (room.creatorId === userId && !owner && online.size) {
    // Other connected players already own active rooms or are ineligible. Do not
    // violate uniqueness or silently choose an offline owner.
    if (reason === "leave")
      throw new AccountError(
        "No hay un participante conectado elegible para recibir la sala. Puedes cerrarla explícitamente.",
        409,
      );
    // Release the expired player's slot once. Keep the historical owner FK while
    // waiting for an eligible connected member; its inactive membership grants
    // no room privileges. Retry transfer, never manufacture another owner.
    if (member.leftAt) return;
  }
  await tx.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { leftAt: member.leftAt ?? now, isCaptain: false },
  });
  await tx.roomPresenceConnection.deleteMany({ where: { roomId, userId } });
  const remaining = await tx.roomMember.findMany({
    where: { roomId, leftAt: null },
  });
  let phase = room.phase;
  const close =
    room.creatorId === userId &&
    !owner &&
    online.size === 0 &&
    reason === "disconnected";
  if (room.creatorId === userId && !owner && reason === "leave") {
    await ensureState(tx, roomId, now);
    const deadline = new Date(now.getTime() + presencePolicy().graceMs);
    await tx.roomPresenceState.update({
      where: { roomId },
      data: { graceUntil: deadline, nextCheckAt: deadline },
    });
  }
  if (close) phase = "CANCELLED";
  else if (
    member.isCaptain &&
    room.formation === "CAPTAINS" &&
    remaining.some((m) => m.isCaptain)
  )
    phase = "CHOOSING_CAPTAINS";
  else if (room.phase === "READY" || member.isCaptain) phase = "WAITING";
  await tx.room.update({
    where: { id: roomId },
    data: {
      phase,
      ...(owner ? { creatorId: owner.userId } : {}),
      ...(close ? { closedAt: now } : {}),
      revision: { increment: 1 },
    },
  });
  // Never delete/cancel/reset Draft or DraftPick. Sealed minigame choices are
  // cleared only when captain identity changes before a first pick exists.
  if (member.isCaptain) {
    const previous = await tx.roomEvent.findFirst({
      where: { roomId, type: "COMPETITIVE" },
      orderBy: { revision: "desc" },
    });
    const payload = previous?.payload as {
      checkpoint?: Record<string, unknown>;
    } | null;
    const draft = await tx.draft.findFirst({
      where: { roomId, status: { not: "CANCELLED" } },
      orderBy: { version: "desc" },
    });
    if (payload?.checkpoint && !draft?.firstPickSide) {
      await tx.roomEvent.create({
        data: {
          roomId,
          type: "COMPETITIVE",
          revision: room.revision + 1,
          payload: {
            command: "captainDisconnected",
            checkpoint: {
              ...payload.checkpoint,
              roundId: crypto.randomUUID(),
              sealed: {},
              dice: {},
              choicesReady: {},
              reveal: null,
              firstPickStarted: false,
              minigameRevealAt: null,
            },
          },
        },
      });
    }
  }
  const label = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { displayName: true, username: true },
  });
  const prefix = `${label.displayName ?? label.username} ${reason === "leave" ? "salió de la sala" : "se desconectó"}.`;
  const newName = owner
    ? await tx.user.findUniqueOrThrow({
        where: { id: owner.userId },
        select: { displayName: true, username: true },
      })
    : null;
  const body =
    prefix +
    (newName
      ? ` El creador abandonó la sala. ${newName.displayName ?? newName.username} es ahora el nuevo creador.`
      : close
        ? " La sala se cerró al quedar sin participantes conectados."
        : room.creatorId === userId && online.size
          ? " La transferencia espera un participante conectado elegible."
          : "");
  await tx.roomMessage.create({ data: { roomId, kind: "SYSTEM", body } });
  await tx.roomEvent.create({
    data: {
      roomId,
      actorId: reason === "leave" ? userId : null,
      type: owner
        ? "OWNER_TRANSFER"
        : close
          ? "EMPTY_ROOM_CLOSED"
          : "MEMBER_DISCONNECTED",
      revision: room.revision + 1,
      payload: {
        reason,
        userId,
        oldOwnerId: room.creatorId,
        newOwnerId: owner?.userId ?? null,
        phases: { from: room.phase, to: phase },
      },
    },
  });
}
export async function leaveWithPresence(
  tx: Tx,
  roomId: string,
  userId: string,
) {
  await withdrawPresenceMember(tx, roomId, userId, "leave", await clock(tx));
}

const bootstrapCursors = new WeakMap<
  object,
  { cursor: string | undefined; done: boolean }
>();
export async function reconcileRoomPresence(db = prisma) {
  if (!(await presenceInstalled(db))) return 0;
  // Bounded initialization for pre-existing rooms: give every member a full
  // grace period after activation, never infer absence from missing old leases.
  let bootstrap = bootstrapCursors.get(db);
  if (!bootstrap) {
    bootstrap = { cursor: undefined, done: false };
    bootstrapCursors.set(db, bootstrap);
  }
  if (!bootstrap.done) {
    // One bounded PK walk per server lifetime, not a repeated anti-join scan of
    // every room. New rooms are registered under their existing Room lock.
    const page = await db.room.findMany({
      where: bootstrap.cursor ? { id: { gt: bootstrap.cursor } } : {},
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    const ids = page.map((r) => r.id);
    if (ids.length)
      await db.$transaction(async (tx) => {
        // Match the heartbeat/cleanup lock order before inserting FK rows.
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id=ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
        await tx.$executeRaw`INSERT INTO "RoomPresenceState" ("roomId","graceUntil","nextCheckAt") SELECT id,now()+(${presencePolicy().graceMs}*interval '1 millisecond'),now()+(${presencePolicy().graceMs}*interval '1 millisecond') FROM "Room" WHERE id=ANY(${ids}::text[]) AND phase NOT IN ('FINISHED','CANCELLED') ON CONFLICT DO NOTHING`;
      });
    bootstrap.cursor = page.at(-1)?.id ?? bootstrap.cursor;
    bootstrap.done = page.length < 100;
  }
  const due = await db.roomPresenceState.findMany({
    where: { nextCheckAt: { lte: new Date() } },
    select: { roomId: true },
    orderBy: { nextCheckAt: "asc" },
    take: 100,
  });
  let count = 0;
  for (const { roomId } of due)
    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Room" WHERE id=${roomId} FOR UPDATE SKIP LOCKED`;
      if (!locked.length) return;
      const now = await clock(tx),
        state = await tx.roomPresenceState.findUniqueOrThrow({
          where: { roomId },
        });
      if (state.nextCheckAt > now || state.graceUntil > now) return;
      const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
      if (
        terminalRoomPhases.includes(
          room.phase as (typeof terminalRoomPhases)[number],
        )
      ) {
        await tx.roomPresenceState.delete({ where: { roomId } });
        await tx.roomPresenceConnection.deleteMany({ where: { roomId } });
        return;
      }
      const online = await liveIds(tx, roomId, now);
      const members = await tx.roomMember.findMany({
        where: { roomId, leftAt: null },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      });
      if (await safeEditable(tx, roomId, room.phase)) {
        // Remove nonowners first. Transfer sees only surviving, currently live users.
        const graceMs = presencePolicy().graceMs;
        for (const m of members.filter(
          (m) =>
            m.userId !== room.creatorId &&
            !online.has(m.userId) &&
            m.joinedAt.getTime() + graceMs <= now.getTime(),
        ))
          await withdrawPresenceMember(
            tx,
            roomId,
            m.userId,
            "disconnected",
            now,
          );
        const ownerMember = members.find((m) => m.userId === room.creatorId);
        if (
          !online.has(room.creatorId) &&
          (!ownerMember ||
            ownerMember.joinedAt.getTime() + graceMs <= now.getTime())
        )
          await withdrawPresenceMember(
            tx,
            roomId,
            room.creatorId,
            "disconnected",
            now,
          );
        const current = await tx.room.findUniqueOrThrow({
          where: { id: roomId },
        });
        if (
          !online.size &&
          current.phase !== "CANCELLED" &&
          (await tx.roomMember.count({ where: { roomId, leftAt: null } })) === 0
        ) {
          await tx.room.update({
            where: { id: roomId },
            data: {
              phase: "CANCELLED",
              closedAt: now,
              revision: { increment: 1 },
            },
          });
          await tx.roomEvent.create({
            data: {
              roomId,
              type: "EMPTY_ROOM_CLOSED",
              revision: current.revision + 1,
              payload: { reason: "presenceExpired" },
            },
          });
        }
      }
      const ids = [...online].sort();
      if (JSON.stringify(ids) !== JSON.stringify(state.onlineUserIds)) {
        const current = await tx.room.update({
          where: { id: roomId },
          data: { revision: { increment: 1 } },
        });
        await tx.roomEvent.create({
          data: {
            roomId,
            type: "WEB_PRESENCE",
            revision: current.revision,
            payload: { onlineUserIds: ids },
          },
        });
      }
      await tx.roomPresenceState.update({
        where: { roomId },
        data: {
          onlineUserIds: ids,
          nextCheckAt: new Date(now.getTime() + presencePolicy().sweepMs),
        },
      });
      count++;
    });
  return count;
}
export async function readOnlineMembers(
  roomId: string,
  db: Pick<Tx, "$queryRaw"> = prisma,
) {
  if (!(await presenceInstalled(db))) return null;
  const rows = await db.$queryRaw<
    { userId: string }[]
  >`SELECT DISTINCT "userId" FROM "RoomPresenceConnection" WHERE "roomId"=${roomId} AND "expiresAt">clock_timestamp()`;
  return new Set(rows.map((r) => r.userId));
}

const timers = globalThis as typeof globalThis & {
  draftoryPresenceSweeper?: ReturnType<typeof setInterval>;
};
export function startPresenceSweeper() {
  if (
    timers.draftoryPresenceSweeper ||
    process.env.DRAFTORY_ENABLE_ROOM_PRESENCE !== "true"
  )
    return;
  let busy = false,
    reported = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await reconcileRoomPresence();
      if (!reported) {
        reported = true;
        console.info("DRAFTORY_ROOM_PRESENCE_READY", presencePolicy());
      }
    } catch {
      console.warn("DRAFTORY_PRESENCE_SWEEP_UNAVAILABLE");
    } finally {
      busy = false;
    }
  };
  timers.draftoryPresenceSweeper = setInterval(
    () => void tick(),
    presencePolicy().sweepMs,
  );
  timers.draftoryPresenceSweeper.unref();
  void tick();
}
