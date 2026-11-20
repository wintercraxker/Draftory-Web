import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { DotaProfileStats } from "./DotaProfileStats";
import { ProfileTabs } from "./ProfileTabs";
import { ManualMedal } from "./ManualMedal";
import { ProfileReportAction } from "./ProfileReportAction";
import { DotaMedal } from "./DotaMedal";
import { ProfileRoles } from "./DotaRoles";
import type { DotaRoleId } from "@/lib/dota-roles";
import { LevelBadge } from "./LevelBadge";
import { ProfileSocialLinks } from "./ProfileSocials";
import { ProfileRecognition } from "../moderation/ProfileRecognition";
import { PublicIdentity } from "./PublicIdentity";
import { AvatarImage } from "./AvatarIdentity";
import {
  ArrowRight,
  Globe,
  MapPin,
  Settings,
  Shield,
  Camera,
  RefreshCw,
  Check,
} from "lucide-react";
import {
  getPlayerRank,
  getXpProgress,
  type CompetitiveStats,
} from "@/lib/competitive";
import {
  getMatchStats,
  getRecentElo,
  type DashboardMatch,
} from "@/lib/dashboard-data";
import { EloValue } from "./EloValue";
import { XpProgress } from "./XpProgress";
import { RecentMatches } from "./RecentMatches";
import { PageHeader, SectionHeader } from "./DashboardUi";
import { Achievements } from "./Achievements";
import type { Achievement } from "@/lib/progression/config";
import type {
  DotaProfileData,
  DotaStatsDto,
  DotaProfileBundle,
} from "@/lib/dota-stats/types";

type Profile = CompetitiveStats & {
  xpTotal?: string;
  publicId?: string | null;
  id?: string;
  preferredRolePrimary?: DotaRoleId | null;
  preferredRoleSecondary?: DotaRoleId | null;
  mmrAvailable?: boolean;
  mmrSource?: string;
  name: string;
  bio: string;
  region: string;
  country: string;
  visibility: string;
  avatar?: string;
  username?: string;
  dotaVisibility?: "private" | "public" | "unknown";
};
const number = (value: number) => value.toLocaleString("en-US");

export function PlayerProfile({
  profile,
  matches,
  roomCount,
  onEdit,
  onAvatar,
  onHistory,
  publicView = false,
  stats: providedStats,
  forecasts,
  social = { commends: 0, mvps: 0 },
  achievements,
  demo = true,
  competitivePending = false,
  achievementsPending = competitivePending,
  points,
  createdAt,
  externalDota,
  onSyncDota,
  syncingDota = false,
  externalBundle,
  recentElo: providedElo,
}: {
  recentElo?: { count: number; total: number };
  profile: Profile;
  matches: DashboardMatch[];
  roomCount: number;
  onEdit?: () => void;
  onAvatar?: () => void;
  onHistory?: () => void;
  publicView?: boolean;
  stats?: ReturnType<typeof getMatchStats>;
  forecasts?: import("@/lib/real/forecast-performance").ForecastPerformance;
  social?: { commends: number; mvps: number };
  achievements?: Achievement[];
  demo?: boolean;
  competitivePending?: boolean;
  achievementsPending?: boolean;
  points?: string;
  createdAt?: string;
  externalDota?: DotaStatsDto;
  onSyncDota?: () => void;
  syncingDota?: boolean;
  externalBundle?: DotaProfileBundle;
}) {
  const external =
    externalDota?.category === "PROFILE"
      ? (externalDota.data as DotaProfileData | null)
      : null;
  const medal = externalDota
    ? {
        name: external?.rank?.name ?? "Rango no disponible",
        image: external?.rank?.image,
        label: external?.leaderboardRank
          ? `Leaderboard #${external.leaderboardRank.toLocaleString("en-US")}`
          : external?.rank?.stars
            ? `${external.rank.stars} estrellas`
            : "",
      }
    : getPlayerRank(profile);
  const stats = providedStats ?? getMatchStats(matches);
  const recentElo = providedElo ?? getRecentElo(matches);
  const level = getXpProgress(
    profile.xpTotal ? BigInt(profile.xpTotal) : profile.xp,
  ).level;
  return (
    <section className="dashboard-enter space-y-6">
      <PageHeader
        eyebrow="Cuenta / Perfil"
        title={publicView ? profile.name : "Mi perfil"}
        description={
          publicView
            ? "Perfil público · identidad y recorrido competitivo en Draftory."
            : "Tu identidad, tu progreso y tu recorrido en Draftory."
        }
      />
      {profile.dotaVisibility === "private" && (
        <div className="dashboard-panel rounded-xl p-4">
          <p className="text-xs font-semibold text-zinc-300">
            Perfil de Dota privado
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Algunas estadísticas externas no están disponibles. El historial,
            ELO, puntos y logros de Draftory siguen funcionando.
          </p>
        </div>
      )}
      <article className="dashboard-panel profile-scene overflow-hidden rounded-2xl">
        <div className="h-16 border-b border-zinc-800/70 bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.09),transparent_70%)] sm:h-20" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="profile-avatar-wrap">
                <AvatarImage
                  hoverable={false}
                  id={profile.id ?? (!publicView ? "self" : undefined)}
                  src={profile.avatar}
                  size={80}
                  alt={profile.name}
                  className="size-20 rounded-2xl object-cover"
                />
                {onAvatar && (
                  <button
                    className="profile-avatar-change"
                    aria-label="Cambiar foto de perfil"
                    onClick={onAvatar}
                  >
                    <span className="profile-avatar-hover-surface">
                      <Camera size={17} />
                      <span>Cambiar foto</span>
                    </span>
                  </button>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="break-words text-2xl font-semibold tracking-tight">
                  <PlayerDisplayName id={profile.id} name={profile.name} />{" "}
                  {!demo && profile.id && (
                    <ProfileRecognition userId={profile.id} />
                  )}
                  <LevelBadge
                    level={level}
                    xp={profile.xpTotal ?? profile.xp}
                    isOwner={!publicView}
                    playerName={profile.name}
                  />
                </h2>
                {!demo && profile.id && (
                  <ProfileSocialLinks userId={profile.id} />
                )}
                <PublicIdentity publicId={profile.publicId} />
                {(profile.username || demo) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    @{profile.username ?? "kyowa"}
                  </p>
                )}
              </div>
            </div>
            {publicView && !onEdit && (
              <ProfileReportAction publicId={profile.publicId} />
            )}{" "}
            {onEdit && (
              <button
                onClick={onEdit}
                className="dashboard-button inline-flex items-center gap-2 px-3 py-2 text-xs"
              >
                <Settings size={14} strokeWidth={1.8} />
                Editar perfil
              </button>
            )}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="grid gap-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,.7fr)]">
                <div className="flex items-center gap-3">
                  <DotaMedal
                    rankTier={external?.rank?.tier}
                    leaderboardRank={external?.leaderboardRank}
                    image={medal.image}
                    name={medal.name}
                  />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Medalla Dota 2
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-200">
                      {medal.name}
                    </p>
                    {external?.rank?.tier !== 80 && (
                      <p className="mt-1 text-xs tabular-nums text-zinc-400">
                        {medal.label}
                      </p>
                    )}
                    {externalDota && profile.mmrAvailable && (
                      <p className="mt-1 text-xs tabular-nums text-zinc-300">
                        {number(profile.mmr)} MMR ·{" "}
                        {profile.mmrSource === "STAFF_VERIFIED"
                          ? "Verificado por Staff"
                          : profile.mmrSource === "DECLARED"
                            ? "Declarado"
                            : "Dato guardado"}
                      </p>
                    )}
                    {externalDota && externalDota.status !== "available" && (
                      <p role="status" className="mt-2 text-xs text-zinc-500">
                        {publicView
                          ? "Estadísticas de Dota 2 no disponibles"
                          : externalDota.status === "stale"
                            ? "Información anterior disponible"
                            : externalDota.status === "private"
                              ? "Estadísticas no disponibles por privacidad"
                              : externalDota.status === "never_synced"
                                ? "Sin sincronizar"
                                : "Estadísticas temporalmente no disponibles"}
                      </p>
                    )}
                    {onSyncDota &&
                      (syncingDota || externalBundle?.manualSync.syncing ? (
                        <span
                          role="status"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-400"
                        >
                          <RefreshCw
                            size={12}
                            className="animate-spin motion-reduce:animate-none"
                          />
                          Sincronizando…
                        </span>
                      ) : externalBundle &&
                        !externalBundle.manualSync.available ? (
                        <span
                          role="status"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-400"
                        >
                          <Check size={12} />
                          {externalBundle.manualSync.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Actualiza tu medalla, clasificación y estadísticas públicas de Dota 2."
                          className="dashboard-link-button mt-2 inline-flex items-center gap-1.5 text-xs"
                          onClick={onSyncDota}
                        >
                          <RefreshCw size={12} />
                          Sincronizar perfil
                        </button>
                      ))}{" "}
                  </div>
                </div>
                <div className="flex flex-col justify-center sm:border-l sm:border-zinc-800 sm:pl-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    ELO Draftory
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-violet-200">
                    <EloValue value={profile.elo} />
                  </p>
                </div>
                <div className="flex flex-col justify-center sm:border-l sm:border-zinc-800 sm:pl-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Nivel
                  </p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-zinc-200">
                    {level}
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <XpProgress xp={profile.xpTotal ?? profile.xp} />
              </div>
            </div>
            <div className="profile-bio min-w-0">
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Sobre mí
              </h2>
              <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
                {profile.bio || "Este jugador aún no ha añadido una bio."}
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-zinc-500" />
                  <dt className="sr-only">País</dt>
                  <dd>{profile.country}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-zinc-500" />
                  <dt className="sr-only">Región</dt>
                  <dd>{profile.region}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Shield size={13} className="text-zinc-500" />
                  <dt className="sr-only">Visibilidad</dt>
                  <dd>Perfil {profile.visibility.toLowerCase()}</dd>
                </div>
              </dl>
              {createdAt && (
                <p className="mt-4 text-xs text-zinc-500">
                  Miembro desde{" "}
                  {new Date(createdAt).toLocaleDateString("es-ES", {
                    timeZone: "UTC",
                  })}
                </p>
              )}
              <ProfileRoles
                key={`${profile.id}-${profile.preferredRolePrimary}`}
                player={profile}
              />
            </div>
          </div>
        </div>
      </article>
      <ProfileTabs>
        {[
          externalBundle ? (
            <div key="dota">
              <DotaProfileStats data={externalBundle} isOwner={!publicView} />
              {externalBundle.availability === "PUBLIC_DATA_NOT_SHARED" &&
                profile.id && (
                  <ManualMedal userId={profile.id} canDeclare={!!onEdit} />
                )}
            </div>
          ) : (
            <p key="dota" className="text-sm text-zinc-500">
              Estadísticas externas no disponibles.
            </p>
          ),
          <section
            key="draftory"
            className="dashboard-panel rounded-2xl p-5 sm:p-6"
            aria-labelledby="profile-stats"
          >
            <SectionHeader
              id="profile-stats"
              eyebrow="Rendimiento"
              title="Estadísticas"
              description={
                demo
                  ? publicView
                    ? "Datos competitivos y reconocimiento de comunidad · demo"
                    : `Historial demo · ${roomCount} salas creadas`
                  : "Progreso propio de Draftory. Los datos externos de Dota se conectan por separado."
              }
            />
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
              {[
                { label: "Partidas competitivas 5v5", value: stats.played },
                { label: "Victorias", value: stats.wins },
                { label: "Derrotas", value: stats.losses },
                { label: "Winrate", value: `${Math.round(stats.winrate)}%` },
                { label: "ELO actual", value: number(profile.elo) },
                { label: "Nivel Draftory", value: level },
                {
                  label: "XP total",
                  value: profile.xpTotal
                    ? BigInt(profile.xpTotal).toLocaleString("en-US")
                    : number(profile.xp),
                },
                {
                  label: "ELO reciente",
                  value: recentElo.count
                    ? `${recentElo.total > 0 ? "+" : ""}${number(recentElo.total)}`
                    : "—",
                },
                { label: "Commends recibidos", value: number(social.commends) },
                { label: "MVPs", value: number(social.mvps) },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs text-zinc-500">{stat.label}</dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums text-zinc-100">
                    {competitivePending &&
                    !providedStats &&
                    stat.label !== "ELO actual"
                      ? "—"
                      : stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            {forecasts && (
              <section
                className="mt-6 border-t border-zinc-800 pt-5"
                aria-label="Rendimiento en pronósticos"
              >
                <h3 className="text-sm font-semibold">Pronósticos gratuitos</h3>
                <p className="mt-2 text-xs text-zinc-500">
                  Puntuación de conocimiento. Independiente del ELO, XP y
                  monedero.
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
                  {[
                    ["Realizados", forecasts.total],
                    ["Aciertos", forecasts.won],
                    ["Fallos", forecasts.lost],
                    [
                      "Precisión",
                      forecasts.accuracy === null
                        ? "—"
                        : `${forecasts.accuracy}%`,
                    ],
                    ["Racha", forecasts.currentStreak],
                    ["Puntuación", forecasts.score],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-zinc-500">{label}</dt>
                      <dd className="mt-2 text-lg font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {points !== undefined && (
              <p className="mt-5 text-sm text-zinc-400">
                Puntos Draftory{" "}
                <strong className="ml-2 text-zinc-200">
                  {BigInt(points).toLocaleString("en-US")}
                </strong>
              </p>
            )}
            {competitivePending && (
              <p className="mt-4 text-xs text-zinc-500">
                Historial reciente pendiente de conectar. ELO, XP, nivel y
                puntos proceden de tu cuenta real.
              </p>
            )}
          </section>,
          <Achievements
            key="achievements"
            pending={achievementsPending}
            items={achievements}
          />,
          <section
            key="history"
            className="dashboard-panel rounded-2xl p-5 sm:p-6"
            aria-labelledby="profile-matches"
          >
            <SectionHeader
              id="profile-matches"
              eyebrow="Historial"
              title={
                publicView && !onEdit
                  ? `Historial reciente de ${profile.name}`
                  : "Tu historial reciente"
              }
              description="Resultados registrados en encuentros de Draftory."
              action={
                onHistory && (
                  <button onClick={onHistory} className="dashboard-link-button">
                    Ver historial
                    <ArrowRight size={14} />
                  </button>
                )
              }
            />
            <div className="mt-3">
              {competitivePending ? (
                <p className="py-4 text-xs text-zinc-500">
                  Historial competitivo pendiente de conectar.
                </p>
              ) : (
                <RecentMatches
                  ownerId={profile.id}
                  matches={matches}
                  limit={5}
                  ownerName={publicView && !onEdit ? profile.name : undefined}
                />
              )}
            </div>
          </section>,
        ]}
      </ProfileTabs>
    </section>
  );
}
