"use client";

import Image from "next/image";
import { useState } from "react";
import {
  dotaRoles,
  validateRole,
  getPreferredRole,
  getSecondaryRole,
  type RoleSource,
  type DotaRoleId,
} from "@/lib/dota-roles";
import { DashboardDropdown } from "./Dropdown";
import { useIdentityRole, useIdentitySecondaryRole } from "./AvatarIdentity";

export function RoleBadge({
  role,
  label = true,
}: {
  role: DotaRoleId | null;
  label?: boolean;
}) {
  const item = dotaRoles.find((item) => item.id === role);

  return item ? (
    <span key={item.id} title={item.name} className="dota-role-badge">
      <Image
        src={item.image}
        alt={label ? "" : item.name}
        width={18}
        height={18}
        unoptimized
      />
      {label && item.name}
    </span>
  ) : (
    <span className="text-xs text-zinc-500">Sin rol elegido</span>
  );
}

export function RoleDropdown({
  value,
  onChange,
  label,
  name,
  disabled,
  compact,
  allowNone,
  noneLabel = "Sin rol secundario",
  exclude,
  emptyTrigger,
}: {
  value: DotaRoleId | null;
  onChange: (role: DotaRoleId | null) => void;
  label: string;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  exclude?: DotaRoleId | null;
  emptyTrigger?: string;
}) {
  const options = [
    ...(allowNone ? [{ value: "", label: noneLabel }] : []),
    ...dotaRoles
      .filter((role) => role.id !== exclude)
      .map((role) => ({
        value: role.id,
        label: role.name,
        image: role.image,
      })),
  ];

  return (
    <DashboardDropdown
      label={label}
      value={value ?? ""}
      options={options}
      name={name}
      compact={compact}
      disabled={disabled}
      triggerLabel={!value ? emptyTrigger : undefined}
      onChange={(role) => onChange(role ? validateRole(role) : null)}
    />
  );
}

export function RoleSelector({
  value,
  onChange,
  disabled,
}: {
  value: DotaRoleId | null;
  onChange: (role: DotaRoleId) => void;
  disabled?: boolean;
}) {
  return (
    <RoleDropdown
      value={value}
      onChange={(role) => {
        if (role) onChange(role);
      }}
      disabled={disabled}
      label="Rol principal"
      name="preferredRolePrimary"
    />
  );
}

export function RoleFormField({
  player,
  primaryOnly = false,
}: {
  player: RoleSource;
  primaryOnly?: boolean;
}) {
  const [primary, setPrimary] = useState(getPreferredRole(player));
  const [secondary, setSecondary] = useState(getSecondaryRole(player));

  return (
    <div className="profile-role-fields">
      <div>
        <p>
          Rol principal <small>Obligatorio</small>
        </p>

        <RoleSelector
          value={primary}
          onChange={(role) => {
            setPrimary(role);

            // El rol principal y secundario no pueden ser iguales.
            if (role === secondary) {
              setSecondary(null);
            }
          }}
        />
      </div>

      {!primaryOnly && (
        <div>
          <p>
            Rol secundario <small>Opcional</small>
          </p>

          <RoleDropdown
            label="Rol secundario"
            name="preferredRoleSecondary"
            value={secondary}
            onChange={setSecondary}
            allowNone
            exclude={primary}
          />
        </div>
      )}

      <p className="profile-role-help">
        Cambiarlas no modifica tu rol en salas actuales.
      </p>
    </div>
  );
}

export function ProfileRoles({
  player,
}: {
  player: RoleSource & { id?: string };
}) {
  const primary = useIdentityRole(player.id, getPreferredRole(player));

  const secondary = useIdentitySecondaryRole(
    player.id,
    getSecondaryRole(player),
  );

  return (
    <section className="profile-preferred-role">
      <p className="dashboard-label">Roles preferidos</p>

      <div className="profile-role-summary">
        <div>
          <RoleBadge role={primary} />
          <small>Principal</small>
        </div>

        {secondary && secondary !== primary && (
          <div>
            <RoleBadge role={secondary} />
            <small>Secundario</small>
          </div>
        )}
      </div>
    </section>
  );
}
