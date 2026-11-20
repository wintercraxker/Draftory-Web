import { matchTracking } from "./match-tracking";
import {
  completedHistoryWhere,
  completedHistoryMatch,
} from "../match-visibility";
import { confirmedLiveStart } from "../live-match-time";
import { resolveDisplayAvatar } from "../display-avatar";
import { prisma } from "../prisma";
import type { DotaRoleId } from "../dota-roles";
import { verifiedDraftoryMatch } from "./verified-match";
import { internalMetrics } from "./achievements-repository";
import { steamAccountId } from "../auth/openid";
import {
  isMatchAnalytics,
  type MatchAnalytics,
  type AnalyticsPlayer,
} from "../dota-stats/match-analytics";
import type { HeroCatalogEntry } from "../dota-stats/types";
import { readPlayerMedals } from "./player-medals";
import { publicTeamRoles, type PublicTeamRole } from "../public-team";

export async function listRealMatches(
  userId: string,
  db = prisma,
  viewerId = userId,
  matchId?: string,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const rows = await tx.match.findMany({
        where: {
          roomId: { not: null },
          players: { some: { userId } },
          ...(matchId
            ? { id: matchId }
            : {
                OR: [
                  { status: { in: ["QUEUED", "LOBBY_SENT", "IN_PROGRESS"] } },
                  completedHistoryWhere,
                ],
              }),
        },
        include: {
          externalLink: { include: { analytics: true } },
          launchControl: true,
          readyCheck: true,
          dotaLobby: {
            select: {
              state: true,
              gcConfirmedAt: true,
              lastObservedAt: true,
              players: { select: { steamId: true, userId: true, team: true } },
            },
          },
          room: {
            select: {
              name: true,
              createdAt: true,
              publicIdentity: true,
              creator: { select: { displayName: true } },
            },
          },
          teams: true,
          players: {
            orderBy: [{ teamSide: "asc" }, { slot: "asc" }],
            include: {
              user: {
                select: {
                  displayName: true,
                  avatar: true,
                  customAvatarUrl: true,
                  profile: { select: { visibility: true } },
                },
              },
              eloHistory: true,
              xpHistory: true,
              mvpAward: true,
            },
          },
          pointTransactions: {
            where: {
              walletId: userId,
              type: { in: ["MATCH_WIN", "MATCH_LOSS"] },
            },
            select: { amount: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: matchId ? 1 : 100,
      });
      const safe = (value: bigint | null | undefined) =>
        value != null &&
        value <= BigInt(Number.MAX_SAFE_INTEGER) &&
        value >= BigInt(Number.MIN_SAFE_INTEGER)
          ? Number(value)
          : undefined;
      const { played, wins } = await internalMetrics(tx, userId);
      const medals = await readPlayerMedals(
        tx,
        rows.flatMap((r) => r.players.map((p) => p.userId)),
        viewerId,
      );
      const catalog =
        ((
          await tx.dotaCatalogCache.findUnique({
            where: { provider: "OPENDOTA" },
          })
        )?.normalized as unknown as HeroCatalogEntry[]) ?? [];
      const grants = await tx.staffAuthorization.findMany({
        where: {
          userId: {
            in: [
              ...new Set(rows.flatMap((r) => r.players.map((p) => p.userId))),
            ],
          },
          revokedAt: null,
        },
        select: { userId: true, role: true },
      });
      const staffRoles = new Map(
        grants
          .filter((g) => Object.hasOwn(publicTeamRoles, g.role))
          .map((g) => [g.userId, g.role as PublicTeamRole]),
      );
      const records = rows.map((row) => {
        const own = row.players.find((p) => p.userId === userId)!;
        const verified = verifiedDraftoryMatch(row);
        const resultVerified =
          row.status === "COMPLETED" &&
          !!row.verifiedAt &&
          !!row.winningSide &&
          !!row.finishedAt;
        const result = resultVerified
          ? row.winningSide === own.teamSide
            ? "Victoria"
            : "Derrota"
          : "Sin resultado";
        const cached = row.externalLink?.analytics
          ?.normalized as unknown as MatchAnalytics | null;
        const analytics =
          cached &&
          isMatchAnalytics(cached, row.dotaMatchId ?? "") &&
          row.externalLink?.dotaMatchId === row.dotaMatchId
            ? {
                source: cached.source,
                verification: "PROVIDER_REPORTED" as const,
                obtainedAt: cached.obtainedAt,
                externalMatchId: cached.externalMatchId,
                duration: cached.duration,
                players: row.players.flatMap((p) => {
                  if (
                    p.userId !== viewerId &&
                    p.user.profile?.visibility !== "PUBLIC"
                  )
                    return [];
                  const binding = row.dotaLobby?.players.find(
                    (v) => v.userId === p.userId,
                  );
                  if (!binding) return [];
                  const found = cached.players.filter(
                    (v) =>
                      v.accountId === steamAccountId(binding.steamId) &&
                      v.side === p.teamSide,
                  );
                  if (
                    found.length !== 1 ||
                    (p.heroId !== null &&
                      found[0].heroId !== null &&
                      p.heroId !== found[0].heroId)
                  )
                    return [];
                  const { accountId: _, ...stats } = found[0];
                  void _;
                  return [
                    {
                      ...stats,
                      userId: p.userId,
                      positionSource:
                        cached.provenance[
                          `players.${found[0].accountId}.position`
                        ] ?? cached.source,
                    },
                  ];
                }),
                picksBans: cached.picksBans,
                timeline: cached.timeline,
              }
            : null;
        const usedHeroes = new Set([
          ...(analytics?.players.map((p) => p.heroId) ?? []),
          ...(analytics?.picksBans.map((p) => p.heroId) ?? []),
        ]);
        const gcHeroes =
          (
            row.launchControl?.warningJournal as {
              LIFECYCLE?: { heroes?: Record<string, number> };
            } | null
          )?.LIFECYCLE?.heroes ?? {};
        for (const p of row.players)
          if (
            p.userId === viewerId ||
            p.user.profile?.visibility === "PUBLIC"
          ) {
            const hero = gcHeroes[p.userId];
            if (Number.isSafeInteger(hero) && hero > 0) usedHeroes.add(hero);
          }
        return {
          tracking: matchTracking({
            ...row,
            roomCreatedAt: row.room?.createdAt,
            lobby: row.dotaLobby,
            control: row.launchControl,
            cache: row.externalLink?.analytics ?? null,
          }),
          id: row.id,
          historyVisible: completedHistoryMatch(row),
          liveStartedAt: confirmedLiveStart(
            {
              status: row.status,
              dotaMatchId: row.dotaMatchId,
              control: row.launchControl,
            },
            clock.now.getTime(),
          ),
          serverNow: clock.now.toISOString(),
          roomId: row.roomId,
          roomPublicId: row.room?.publicIdentity?.publicId ?? null,
          analytics,
          heroCatalog: catalog.filter((h) => usedHeroes.has(h.heroId)),
          mvpUserId: verified
            ? (row.players.find((p) => p.mvpAward)?.userId ?? null)
            : null,
          winningSide: resultVerified ? row.winningSide : null,
          attemptNumber: row.attemptNumber,
          name: row.room?.name ?? "Partida Draftory",
          mode: row.mode,
          verifiedMode: resultVerified ? row.mode : undefined,
          region: row.region,
          host: row.room?.creator.displayName ?? undefined,
          status: row.status,
          attemptFailed:
            row.status === "CANCELLED" && row.dotaLobby?.state === "FAILED",
          result,
          playerId: userId,
          playerTeam: own.teamSide.toLowerCase() as "radiant" | "dire",
          createdAt: row.createdAt.toISOString(),
          startedAt: row.startedAt?.toISOString(),
          finishedAt: row.finishedAt?.toISOString(),
          durationSeconds: row.durationSeconds,
          verified,
          eloBefore: verified ? own.eloHistory?.eloBefore : undefined,
          eloAfter: verified ? own.eloHistory?.eloAfter : undefined,
          eloChange: verified ? own.eloHistory?.eloChange : undefined,
          xpChange: verified ? safe(own.xpHistory?.xpChange) : undefined,
          pointsChange:
            verified && row.pointTransactions.length
              ? safe(
                  row.pointTransactions.reduce(
                    (sum, p) => sum + p.amount,
                    BigInt(0),
                  ),
                )
              : undefined,
          teams: row.teams.map((team) => ({
            side: team.side,
            name: team.name,
            score: team.score,
            players: row.players
              .filter((p) => p.teamSide === team.side)
              .map((p) => ({
                ...medals.get(p.userId),
                userId: p.userId,
                name: p.user.displayName ?? "Jugador de Steam",
                avatar: resolveDisplayAvatar(p.user),
                heroId:
                  analytics?.players.find((a) => a.userId === p.userId)
                    ?.heroId ??
                  ((p.userId === viewerId ||
                    p.user.profile?.visibility === "PUBLIC") &&
                  Number.isSafeInteger(gcHeroes[p.userId]) &&
                  gcHeroes[p.userId] > 0
                    ? gcHeroes[p.userId]
                    : null),
                roomRole: (p.roomRole?.toLowerCase() as DotaRoleId) ?? null,
                isCaptain: p.isCaptain,
                mmr: p.mmrSnapshot,
                staffRole: staffRoles.get(p.userId),
                elo: p.eloBefore,
                level: p.levelSnapshot,
              })),
          })),
        };
      });
      return {
        records,
        statistics: {
          played,
          wins,
          losses: played - wins,
          winrate: played ? (wins / played) * 100 : 0,
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type RealMatch = Awaited<
  ReturnType<typeof listRealMatches>
>["records"][number];
export type PublicMatchAnalytics = {
  verification?: "PROVIDER_REPORTED";
  source?: string;
  obtainedAt?: string;
  externalMatchId?: string;
  duration?: number | null;
  players: (Omit<AnalyticsPlayer, "accountId"> & {
    userId: string;
    positionSource?: string;
  })[];
  picksBans: MatchAnalytics["picksBans"];
  timeline: MatchAnalytics["timeline"];
};
