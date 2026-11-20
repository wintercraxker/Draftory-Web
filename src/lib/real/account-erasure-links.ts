import type { Prisma } from "../../generated/prisma/client";
import { AccountError } from "./errors";

export class AccountDeletionBlocked extends AccountError {
  readonly block: string;
  readonly resolution: string;
  constructor(
    block: string,
    message: string,
    resolution = "/configuracion?tab=cuenta",
  ) {
    super(message, 409);
    this.block = block;
    this.resolution = resolution;
  }
}

// This classification never writes lobby/job/worker state and never releases a bot.
// CLOSED is a committed operational closure, including explicit administrative
// resolution. It does not mean that a fresh GC departure was observed.
export async function classifyErasureLobbies(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const lobbies = await tx.dotaLobby.findMany({
    where: { match: { players: { some: { userId } } } },
    include: {
      match: { select: { status: true, verifiedAt: true } },
      launchControl: {
        select: { launchRequestId: true, externalMatchId: true },
      },
      terminalCleanup: {
        select: { status: true, completedAt: true, errorCode: true },
      },
      jobs: {
        select: {
          kind: true,
          status: true,
          attempts: true,
          dispatchedAt: true,
          completedAt: true,
          leaseToken: true,
          errorCode: true,
        },
      },
    },
  });
  const counts = { terminal: 0, historical: 0, uncertain: 0 };
  for (const lobby of lobbies) {
    const terminalMatch =
      lobby.match.status === "CANCELLED" ||
      (lobby.match.status === "COMPLETED" && !!lobby.match.verifiedAt);
    const pending =
      lobby.jobs.some(
        (j) =>
          ["PENDING", "LEASED", "RECONCILE"].includes(j.status) ||
          !!j.leaseToken,
      ) ||
      !!(
        lobby.terminalCleanup &&
        (lobby.terminalCleanup.status !== "CLOSED" ||
          !lobby.terminalCleanup.completedAt ||
          lobby.terminalCleanup.errorCode)
      );
    const launch = !!(
      lobby.launchControl?.launchRequestId ||
      lobby.launchControl?.externalMatchId
    );
    if (pending || !terminalMatch) {
      counts.uncertain++;
      continue;
    }
    if (lobby.state === "CLOSED") {
      counts.terminal++;
      continue;
    }
    const neverDispatched =
      !lobby.lobbyId &&
      !lobby.gcConfirmedAt &&
      !launch &&
      lobby.jobs.every((j) => !j.dispatchedAt && j.attempts === 0);
    if (["CANCELLED", "FAILED"].includes(lobby.state) && neverDispatched) {
      counts.historical++;
      continue;
    }
    const cancelledBeforeLaunch =
      lobby.state === "CANCELLED" &&
      !launch &&
      lobby.jobs.some(
        (j) =>
          j.kind === "CANCEL_LOBBY" &&
          j.status === "SUCCEEDED" &&
          !!j.completedAt &&
          !j.errorCode,
      );
    if (cancelledBeforeLaunch) {
      counts.terminal++;
      continue;
    }
    counts.uncertain++;
  }
  return counts;
}
