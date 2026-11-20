"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SoundSettings } from "../dashboard/SoundSettings";
import { SocialSettings } from "../dashboard/ProfileSocials";
import { ActiveSessions } from "./ActiveSessions";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserRound,
  Database,
  LockKeyhole,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  Camera,
  Volume2,
} from "lucide-react";
import type { RealProfile } from "@/lib/real/types";
import type { DotaProfileBundle } from "@/lib/dota-stats/types";
import { TourReplay } from "../dashboard/TourReplay";
import {
  CompetitiveMmrEditor,
  useCompetitiveMmr,
} from "../dashboard/CompetitiveMmr";
import { DotaPrivacyNotice } from "../dashboard/DotaPrivacyNotice";
import { profileDataState } from "@/lib/dota-stats/profile-state";
import { ProfileTabs } from "../dashboard/ProfileTabs";
import { RoleFormField } from "../dashboard/DotaRoles";
import styles from "./ProfileSubtabs.module.css";
import { ProfileSettingsFields } from "../dashboard/ProfileSettingsFields";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import { PublicIdentity } from "../dashboard/PublicIdentity";
import { AccountDangerZone } from "../dashboard/AccountDangerZone";
import { DashboardButton, PageHeader } from "../dashboard/DashboardUi";

export function SettingsFeedback({
  notice,
  tone = "info",
}: {
  notice: string;
  tone?: "success" | "error" | "info";
}) {
  return notice ? (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={"settings-feedback settings-feedback-" + tone}
    >
      {tone === "success" ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Info size={14} aria-hidden="true" />
      )}
      {notice}
    </p>
  ) : null;
}
export function PrivacyChoices({ visibility }: { visibility: string }) {
  const [selected, setSelected] = useState(visibility);
  const publicProfile = selected === "PUBLIC";
  const points = publicProfile
    ? [
        "Apareces en Clasificación",
        "Otros jugadores pueden abrir tu perfil",
        "Se muestran estadísticas, roles y progreso permitidos",
        "Puedes ser encontrado y reportado mediante tu ID Draftory",
      ]
    : [
        "Tu nombre, avatar, ID y nivel siguen disponibles donde sean necesarios",
        "Sigues pudiendo jugar normalmente y ser reportado por ID",
        "No se muestran tus estadísticas detalladas, historial ni logros",
        "No apareces en Clasificación",
      ];
  return (
    <>
      <fieldset>
        <legend className="dashboard-label">Visibilidad</legend>
        <div className="settings-privacy-choice mt-4">
          {(["PUBLIC", "PRIVATE"] as const).map((value) => (
            <label key={value} data-selected={selected === value}>
              <input
                type="radio"
                className="sr-only"
                name="visibility"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
              />
              {value === "PUBLIC" ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>{value === "PUBLIC" ? "Público" : "Privado"}</span>
              {selected === value && <Check size={14} className="ml-auto" />}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="settings-group mt-5">
        <h3 className="text-sm font-semibold">
          {publicProfile ? "Perfil público" : "Perfil privado"}
        </h3>
        <p className="settings-help mt-2">
          {publicProfile
            ? "Otros jugadores pueden consultar la información pública de tu perfil, estadísticas, roles y progreso permitido."
            : "Tu perfil detallado queda oculto para otros jugadores."}
        </p>
        <ul className="mt-4 grid gap-3 text-xs text-zinc-400 sm:grid-cols-2">
          {points.map((point, i) => (
            <li key={point} className="flex gap-2">
              {!publicProfile && i >= 2 ? (
                <EyeOff size={14} className="mt-0.5 shrink-0 text-zinc-500" />
              ) : (
                <Check
                  size={14}
                  className="mt-0.5 shrink-0 text-violet-300/70"
                />
              )}
              {point}
            </li>
          ))}
        </ul>
      </div>
      <p className="settings-help mt-4">
        Los perfiles privados no aparecen en la clasificación pública. Cambiar
        la visibilidad conserva tu ELO, XP, partidas y logros.
      </p>
    </>
  );
}
function friendlyDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
}
export function AccountSettings({
  profile,
  external,
  busy,
  dotaBusy,
  notice,
  noticeTone = "info",
  onSave,
  onSync,
  onAvatar,
  onRestore,
  avatarEditor,
}: {
  profile: RealProfile;
  external?: DotaProfileBundle;
  busy: boolean;
  dotaBusy: boolean;
  notice: string;
  noticeTone?: "success" | "error" | "info";
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onSync: () => Promise<void>;
  onAvatar: () => void;
  onRestore: () => Promise<void>;
  avatarEditor?: ReactNode;
}) {
  const query = useSearchParams();
  const router = useRouter();
  const mmrModel = useCompetitiveMmr();
  const verifiedMmr =
    !!mmrModel.feed?.row?.verified && (mmrModel.feed.row.value ?? 0) > 0;
  useEffect(() => {
    if (verifiedMmr && query.get("tab") === "mmr") {
      const params = new URLSearchParams(query.toString());
      params.set("tab", "dota");
      router.replace("/configuracion?" + params, { scroll: false });
    }
  }, [verifiedMmr, query, router]);
  const setTab = (tab: number) => {
    const params = new URLSearchParams(query.toString());
    params.set(
      "tab",
      ["perfil", "dota", "privacidad", "sonidos", "cuenta", "mmr"][tab],
    );
    router.replace("/configuracion?" + params, { scroll: false });
  };
  const requestedTab =
    { perfil: 0, dota: 1, privacidad: 2, sonidos: 3, cuenta: 4, mmr: 5 }[
      query.get("tab") ?? "perfil"
    ] ?? 0;
  const tab = verifiedMmr && requestedTab === 5 ? 1 : requestedTab;
  const tabsRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar =
      tabsRoot.current?.querySelector<HTMLElement>('[role="tablist"]');
    const selected = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (bar && selected) {
      const row = bar.getBoundingClientRect(),
        item = selected.getBoundingClientRect();
      if (item.right > row.right) bar.scrollLeft += item.right - row.right + 8;
      else if (item.left < row.left) bar.scrollLeft -= row.left - item.left + 8;
    }
  }, [tab]);
  const defaults = {
    displayName: profile.name,
    bio: profile.bio,
    country: profile.country,
    region: profile.region,
    preferredRolePrimary: profile.preferredRolePrimary,
    preferredRoleSecondary: profile.preferredRoleSecondary,
    visibility: profile.visibility,
  };
  const sync = external?.manualSync,
    outcome = sync?.outcome;
  const state = external ? profileDataState(external) : null;
  const status = sync?.syncing
    ? "Preparando estadísticas…"
    : state === "NO_DATA"
      ? "Sin datos públicos"
      : state === "NOT_PUBLIC"
        ? "Datos no publicados"
        : state === "TECHNICAL_ERROR"
          ? "Error recuperable"
          : state === "STALE"
            ? "Datos anteriores"
            : outcome === "PARTIAL_SUCCESS"
              ? "Parcial"
              : state === "AVAILABLE"
                ? "Disponible"
                : "Consultando estado…";
  const lastUpdate = external
    ? [
        external.profile,
        external.winloss,
        external.heroes,
        external.performance,
      ]
        .map((r) => r.lastSuccessAt)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1)
    : null;
  const cooldown = sync?.label?.replace(
    /^(Perfil sincronizado|Sincronización parcial|No se pudo sincronizar) · /,
    "",
  );
  return (
    <section className="dashboard-enter settings-page">
      <PageHeader
        eyebrow="Cuenta / Configuración"
        title="Configuración"
        description="Tu identidad, datos y preferencias de Draftory."
      />
      {avatarEditor}
      <div className="mt-6" ref={tabsRoot}>
        <ProfileTabs
          activeIndex={tab}
          onActiveChange={setTab}
          labels={[
            "Perfil",
            "Dota 2",
            "Privacidad",
            "Sonidos",
            "Cuenta",
            ...(!verifiedMmr ? ["MMR de Dota 2"] : []),
          ]}
          icons={[
            <UserRound key="profile" size={14} />,
            <Database key="dota" size={14} />,
            <LockKeyhole key="privacy" size={14} />,
            <Volume2 key="sounds" size={14} />,
            <ShieldCheck key="account" size={14} />,
          ]}
          ariaLabel="Configuración de cuenta"
        >
          {[
            <section key="profile" className={styles.subtabs}>
              <ProfileTabs
                labels={["Datos de perfil", "Redes sociales"]}
                ariaLabel="Opciones de perfil"
              >
                {[
                  <div key="details" className="space-y-6" data-profile-details>
                    <form
                      key="profile"
                      className="dashboard-panel dashboard-form settings-panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void onSave({
                          ...defaults,
                          ...Object.fromEntries(new FormData(e.currentTarget)),
                        });
                      }}
                    >
                      <div className="settings-avatar-row">
                        <AvatarImage
                          hoverable={false}
                          id={profile.id}
                          src={profile.avatar ?? undefined}
                          size={56}
                          alt={profile.name}
                          className="size-14 rounded-xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            Foto de perfil
                          </p>
                          <p className="settings-help mt-1">
                            Tu identidad visual en Draftory.
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <DashboardButton disabled={busy} onClick={onAvatar}>
                              <Camera size={14} />
                              Cambiar foto
                            </DashboardButton>
                            {profile.avatar?.startsWith(
                              "/api/profile/avatar/",
                            ) && (
                              <button
                                type="button"
                                disabled={busy}
                                className="dashboard-link-button text-xs"
                                onClick={onRestore}
                              >
                                Restaurar avatar de Steam
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <ProfileSettingsFields
                        hideRoles
                        grouped
                        hideVisibility
                        profile={profile}
                        nameField="displayName"
                        visibilityOptions={[
                          { value: "PUBLIC", label: "Público" },
                          { value: "PRIVATE", label: "Privado" },
                        ]}
                      />
                      <div className="settings-save-row">
                        <DashboardButton
                          variant="primary"
                          type="submit"
                          busy={busy}
                        >
                          {busy ? "Guardando…" : "Guardar cambios"}
                        </DashboardButton>
                        <SettingsFeedback notice={notice} tone={noticeTone} />
                      </div>
                    </form>
                    <form
                      className="dashboard-panel settings-panel"
                      data-role-settings
                      onSubmit={(e) => {
                        e.preventDefault();
                        void onSave({
                          ...defaults,
                          ...Object.fromEntries(new FormData(e.currentTarget)),
                        });
                      }}
                    >
                      <h3 className="dashboard-section-title">
                        Roles preferidos
                      </h3>
                      <p className="settings-help mt-2">
                        Tus preferencias para futuras salas. No cambian tu rol
                        en partidas actuales.
                      </p>
                      <div className="mt-5">
                        <RoleFormField
                          key={
                            profile.preferredRolePrimary +
                            String(profile.preferredRoleSecondary)
                          }
                          player={profile}
                        />
                      </div>
                      <div className="settings-save-row">
                        <DashboardButton
                          variant="primary"
                          type="submit"
                          busy={busy}
                        >
                          Guardar roles
                        </DashboardButton>
                        <SettingsFeedback notice={notice} tone={noticeTone} />
                      </div>
                    </form>
                  </div>,
                  <SocialSettings key="socials" userId={profile.id} />,
                ]}
              </ProfileTabs>
            </section>,
            <section key="dota" className="dashboard-panel settings-panel">
              {verifiedMmr && <CompetitiveMmrEditor model={mmrModel} />}
              <div className="settings-section-heading">
                <Database size={18} />
                <div>
                  <h2 className="dashboard-section-title">Datos de Dota 2</h2>
                  <p className="settings-help mt-2">
                    Draftory utiliza datos públicos de Dota 2 para mostrar
                    estadísticas en tu perfil. Estos datos no modifican tu ELO,
                    XP ni progreso competitivo de Draftory.
                  </p>
                </div>
              </div>
              <dl className="settings-sync-summary">
                <div>
                  <dt className="dashboard-label">Estado</dt>
                  <dd>
                    <span
                      className="settings-state"
                      data-state={outcome ?? "PENDING"}
                    >
                      {status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="dashboard-label">Última actualización</dt>
                  <dd>
                    {friendlyDate(lastUpdate ?? sync?.lastSuccessfulSyncAt) ??
                      "Sin actualización disponible"}
                  </dd>
                </div>
                <div>
                  <dt className="dashboard-label">Próxima actualización</dt>
                  <dd>
                    {sync?.available
                      ? "Disponible ahora"
                      : sync?.syncing
                        ? "Actualización en curso"
                        : cooldown || "Consultando disponibilidad…"}
                  </dd>
                </div>
              </dl>
              <div className="settings-group">
                <p className="dashboard-label">Disponibilidad de datos</p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
                  <span>
                    Perfil público:{" "}
                    {external?.profile?.data ? "disponible" : "no disponible"}
                  </span>
                  <span>
                    Estadísticas adicionales:{" "}
                    {external?.analytics?.data
                      ? "disponibles"
                      : "no disponibles"}
                  </span>
                </div>
                {external && state && state !== "AVAILABLE" && (
                  <DotaPrivacyNotice isOwner state={state} />
                )}
              </div>
              <div className="settings-save-row">
                <div>
                  <DashboardButton
                    variant="primary"
                    disabled={!sync?.available}
                    busy={dotaBusy}
                    onClick={() => void onSync()}
                  >
                    <RefreshCw size={14} />
                    {dotaBusy ? "Actualizando…" : "Actualizar estadísticas"}
                  </DashboardButton>
                  {!sync?.available && !dotaBusy && cooldown && (
                    <p className="settings-help mt-2">{cooldown}</p>
                  )}
                </div>
                <SettingsFeedback notice={notice} tone={noticeTone} />
              </div>
            </section>,
            <form
              key="privacy"
              className="dashboard-panel dashboard-form settings-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void onSave({
                  ...defaults,
                  visibility: new FormData(e.currentTarget).get("visibility"),
                });
              }}
            >
              <div className="settings-section-heading">
                <LockKeyhole size={18} />
                <div>
                  <h2 className="dashboard-section-title">
                    Privacidad del perfil
                  </h2>
                  <p className="settings-help mt-2">
                    Elige qué pueden consultar otros jugadores.
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <PrivacyChoices
                  key={profile.visibility}
                  visibility={profile.visibility}
                />
              </div>
              <div className="settings-save-row">
                <DashboardButton type="submit" variant="primary" busy={busy}>
                  {busy ? "Guardando…" : "Guardar privacidad"}
                </DashboardButton>
                <SettingsFeedback notice={notice} tone={noticeTone} />
              </div>
            </form>,
            <section key="sounds" className="dashboard-panel settings-panel">
              <SoundSettings />
            </section>,
            <section key="account" className="dashboard-panel settings-panel">
              <div className="settings-section-heading">
                <ShieldCheck size={18} />
                <div>
                  <h2 className="dashboard-section-title">Tu cuenta</h2>
                  <p className="settings-help mt-2">
                    Identidad y acceso a Draftory.
                  </p>
                </div>
              </div>
              <div className="settings-account-row">
                <div>
                  <p className="dashboard-label">Identidad Draftory</p>
                  <p className="settings-help mt-2">
                    Tu identificador único. Otros jugadores pueden utilizarlo
                    para encontrarte o reportar una incidencia.
                  </p>
                </div>
                <PublicIdentity publicId={profile.publicId} />
              </div>
              <ActiveSessions active={tab === 4} />
              <TourReplay />
              <AccountDangerZone />
            </section>,
            ...(!verifiedMmr
              ? [<CompetitiveMmrEditor key="mmr" model={mmrModel} />]
              : []),
          ]}
        </ProfileTabs>
      </div>
    </section>
  );
}
