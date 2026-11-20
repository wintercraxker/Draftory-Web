import { DropdownField } from "./Dropdown";
import { RoleFormField } from "./DotaRoles";
import type { RoleSource } from "@/lib/dota-roles";
import { accountCountries, accountRegions } from "@/lib/auth/onboarding";
import type { ReactNode } from "react";

// The original settings composition, shared by both transports.
export function ProfileSettingsFields({
  profile,
  nameField = "name",
  visibilityOptions,
  dotaControls,
  mmrControl,
  hideVisibility = false,
  grouped = false,
  hideRoles = false,
}: {
  profile: RoleSource & {
    name: string;
    bio: string;
    country?: string | null;
    region?: string | null;
    visibility: string;
  };
  nameField?: string;
  visibilityOptions: { value: string; label: string }[];
  dotaControls?: ReactNode;
  mmrControl?: ReactNode;
  hideVisibility?: boolean;
  grouped?: boolean;
  hideRoles?: boolean;
}) {
  if (grouped)
    return (
      <div className="settings-fields">
        <fieldset className="settings-group">
          <legend className="dashboard-label">Identidad</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              Nombre visible
              <input
                name={nameField}
                defaultValue={profile.name}
                required
                maxLength={64}
                className="settings-input"
              />
              <span className="settings-help">
                Tu nombre en Draftory. No cambia tu nombre de Steam.
              </span>
            </label>
            <label>
              Bio
              <textarea
                name="bio"
                defaultValue={profile.bio}
                maxLength={500}
                rows={2}
                className="settings-input resize-y"
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend className="dashboard-label">Localización</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs">País</p>
              <DropdownField
                label="País"
                name="country"
                defaultValue={profile.country ?? undefined}
                options={accountCountries.map((value) => ({
                  value,
                  label: value,
                }))}
                className="dashboard-dropdown-field w-full"
              />
            </div>
            <div>
              <p className="mb-2 text-xs">Región</p>
              <DropdownField
                label="Región"
                name="region"
                defaultValue={profile.region ?? undefined}
                options={accountRegions.map((value) => ({
                  value,
                  label: value,
                }))}
                className="dashboard-dropdown-field w-full"
              />
            </div>
          </div>
        </fieldset>
        {!hideRoles && (
          <fieldset className="settings-group">
            <legend className="dashboard-label">Roles preferidos</legend>
            <p className="settings-help mt-2">
              Estos roles se utilizarán como preferencia al entrar en una sala.
            </p>
            <div className="mt-4">
              <RoleFormField
                key={
                  "roles-" +
                  profile.preferredRolePrimary +
                  profile.preferredRoleSecondary
                }
                player={profile}
              />
            </div>
          </fieldset>
        )}
        <input type="hidden" name="visibility" value={profile.visibility} />
      </div>
    );
  return (
    <>
      <div className="dashboard-settings-grid">
        <div className="space-y-5">
          <label className="block text-sm">
            Nombre visible
            <input
              name={nameField}
              defaultValue={profile.name}
              required
              maxLength={64}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            />
          </label>
          {mmrControl}
          <label className="block text-sm">
            Bio
            <textarea
              name="bio"
              defaultValue={profile.bio}
              maxLength={500}
              rows={3}
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3"
            />
          </label>
        </div>
        <div className="space-y-5">
          <label className="block text-sm">
            Región
            <DropdownField
              label="Región"
              name="region"
              defaultValue={profile.region ?? undefined}
              options={accountRegions.map((value) => ({ value, label: value }))}
              className="dashboard-dropdown-field mt-2 w-full"
            />
          </label>
          <label className="block text-sm">
            País
            <DropdownField
              label="País"
              name="country"
              defaultValue={profile.country ?? undefined}
              options={accountCountries.map((value) => ({
                value,
                label: value,
              }))}
              className="dashboard-dropdown-field mt-2 w-full"
            />
          </label>
          {dotaControls}
          {hideVisibility ? (
            <input type="hidden" name="visibility" value={profile.visibility} />
          ) : (
            <label className="block text-sm">
              Visibilidad
              <DropdownField
                label="Visibilidad"
                name="visibility"
                defaultValue={profile.visibility}
                options={visibilityOptions}
                className="dashboard-dropdown-field mt-2 w-full"
              />
            </label>
          )}
        </div>
      </div>
      <RoleFormField
        key={`${profile.preferredRolePrimary}-${profile.preferredRoleSecondary}`}
        player={profile}
      />
    </>
  );
}
