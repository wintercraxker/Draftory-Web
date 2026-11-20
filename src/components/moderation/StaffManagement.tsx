"use client";
import { validStaffFeed } from "@/lib/staff-response";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  UserRound,
  ShieldCheck,
  ArrowRight,
  Save,
  KeyRound,
  ChevronDown,
  LockKeyhole,
} from "lucide-react";
import { StaffIdentity } from "./StaffIdentity";
import { StaffRoleBadge } from "./ProfileRecognition";
import { StaffButton, StaffPager, StaffEmpty } from "./StaffUi";
import { staffPermissionLabels } from "@/lib/moderation-presentation";
import type { staffDashboard } from "@/lib/real/staff-repository";
export type StaffFeed = Awaited<ReturnType<typeof staffDashboard>>;
export type ActionContext = {
  onSuccess?: () => void;
  target?: string;
  before?: string;
  after?: string;
  consequence?: string;
  reportedAccount?: string;
  reviewer?: string;
  ownerExceptionRequired?: boolean;
  durationPreview?: string;
  reportLabel?: string;
};
type Candidate = StaffFeed["users"][number];
const roles = [
  {
    id: "USER",
    name: "Usuario",
    description: "Sin acceso ni capacidades administrativas.",
  },
  {
    id: "HELPER",
    name: "Ayudante",
    description: "Soporte y revisión de reportes según permisos efectivos.",
  },
  {
    id: "MODERATOR",
    name: "Moderador",
    description: "Moderación de comunidad y sanciones autorizadas.",
  },
  {
    id: "ADMIN",
    name: "Administrador",
    description: "Administración y gestión de incidentes autorizados.",
  },
];
const permissionHelp: Record<string, string> = {
  "users.view":
    "Consultar identidades y el estado administrativo de las cuentas.",
  "users.search":
    "Localizar cuentas por nombre, DF-ID, SteamID64 o ID interno.",
  "reports.view": "Leer reportes y su evidencia permitida.",
  "reports.resolve": "Asignar una investigación y registrar su resolución.",
  "history.view": "Consultar sanciones e historial administrativo de usuarios.",
  "users.warn": "Registrar una advertencia y notificar al usuario.",
  "users.mute": "Impedir temporalmente el envío de mensajes.",
  "users.suspend": "Restringir temporalmente nuevas participaciones.",
  "users.ban": "Aplicar una suspensión permanente, respetando jerarquías.",
  "users.revoke": "Revocar una sanción dentro de los límites del cargo.",
  "messages.moderate": "Retirar mensajes conservando su auditoría.",
  "rooms.moderate": "Cerrar salas en espera que no tengan una partida activa.",
  "rooms.kick": "Retirar participantes cuando la fase de sala lo permita.",
  "staff.manage": "Gestionar miembros de rango inferior.",
  "staff.assign": "Asignar cargos inferiores, sin alterar al OWNER.",
  "permissions.configure":
    "La configuración de permisos permanece reservada al OWNER.",
  "audit.view": "Consultar el registro persistente de operaciones.",
  "medals.verify": "Revisar y verificar medallas declaradas.",
};
function group(permission: string) {
  if (
    [
      "users.warn",
      "users.mute",
      "users.suspend",
      "users.ban",
      "users.revoke",
      "history.view",
    ].includes(permission)
  )
    return "Sanciones";
  return (
    (
      {
        users: "Usuarios",
        reports: "Reportes",
        rooms: "Salas",
        messages: "Mensajes",
        staff: "Staff",
        permissions: "Staff",
        audit: "Auditoría",
        medals: "Perfiles",
      } as Record<string, string>
    )[permission.split(".")[0]] ?? "Otros"
  );
}

export function StaffManagement({
  feed,
  busy,
  actorId,
  onAction,
}: {
  feed: StaffFeed;
  busy: boolean;
  actorId?: string;
  onAction: (
    payload: Record<string, unknown>,
    context?: ActionContext,
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState(feed.users),
    [pagination, setPagination] = useState(feed.pagination),
    [searching, setSearching] = useState(false),
    [error, setError] = useState("");
  const [chosen, setChosen] = useState<Candidate | null>(null),
    [role, setRole] = useState("HELPER"),
    [reason, setReason] = useState("");
  const [permissionRole, setPermissionRole] = useState("HELPER"),
    [permissionFilter, setPermissionFilter] = useState(""),
    [change, setChange] = useState<{
      permission: string;
      allowed: boolean;
    } | null>(null),
    [permissionReason, setPermissionReason] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const request = useRef(0),
    roleEditor = useRef<HTMLElement>(null);
  // OWNER's complete membership list is the authoritative current-role snapshot.
  const currentRole = chosen
    ? (feed.staffMembers.find((m) => m.userId === chosen.id)?.role ?? "USER")
    : null;
  const search = useCallback(
    async (page = 1) => {
      const version = ++request.current;
      setSearching(true);
      setError("");
      try {
        const r = await fetch(
          `/api/staff?search=${encodeURIComponent(query.trim())}&page=${page}&pageSize=6`,
          { cache: "no-store" },
        );
        const v = await r.json();
        if (!r.ok) throw Error(v.error);
        if (!validStaffFeed(v))
          throw Error("Respuesta incompleta al buscar usuarios.");
        if (v.moduleErrors.includes("users"))
          throw Error(
            "La búsqueda de usuarios no está disponible temporalmente.",
          );
        if (version === request.current) {
          setResults(v.users);
          setPagination(v.pagination);
        }
      } catch (e) {
        if (version === request.current)
          setError(
            e instanceof Error ? e.message : "No se pudieron buscar usuarios.",
          );
      } finally {
        if (version === request.current) setSearching(false);
      }
    },
    [query],
  );
  const initialSearch = useRef(search);
  useEffect(() => {
    const timer = setTimeout(() => void initialSearch.current(), 0);
    return () => clearTimeout(timer);
  }, []);
  const editable =
    feed.access.role === "OWNER" &&
    feed.access.permissions.includes("staff.assign") &&
    feed.access.permissions.includes("staff.manage");
  const permissionEditable =
    feed.access.role === "OWNER" &&
    feed.access.permissions.includes("permissions.configure");
  const selectedPolicy = feed.permissionMatrix.find(
    (r) => r.role === permissionRole,
  );
  const filteredPermissions =
    selectedPolicy?.permissions.filter((p) =>
      `${staffPermissionLabels[p.permission]} ${p.permission} ${group(p.permission)}`
        .toLowerCase()
        .includes(permissionFilter.toLowerCase()),
    ) ?? [];
  const chosenPolicy = selectedPolicy?.permissions.find(
    (p) => p.permission === change?.permission,
  );
  const valid = Boolean(
    editable &&
    chosen &&
    chosen.id !== actorId &&
    currentRole !== "OWNER" &&
    role !== currentRole &&
    reason.trim().length >= 3,
  );
  return (
    <div className="staff-management" data-managed-drafts>
      <section
        ref={roleEditor}
        className="staff-surface staff-role-editor"
        aria-labelledby="assign-role-title"
      >
        <div className="staff-section-heading">
          <div>
            <p className="dashboard-label">01 · IDENTIDAD Y CARGO</p>
            <h2 id="assign-role-title">Asignar rol</h2>
          </div>
          <UserRound size={21} />
        </div>
        <p className="staff-help">
          Busca una cuenta, revisa su cargo y prepara el cambio. El OWNER no
          puede modificarse desde la web.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          className="staff-search-row"
        >
          <label>
            <span className="sr-only">Buscar usuario para asignar rol</span>
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={128}
              placeholder="Nombre, DF-ID, SteamID64 o ID interno"
            />
          </label>
          <StaffButton
            type="submit"
            loading={searching}
            disabled={!feed.access.permissions.includes("users.search")}
          >
            <Search size={15} />
            Buscar
          </StaffButton>
        </form>
        {error && (
          <p role="alert" className="staff-alert staff-alert--error">
            {error}
          </p>
        )}
        <div
          className="staff-candidate-list"
          aria-label="Resultados de búsqueda de usuarios"
        >
          {results
            .filter((u) => u.access.role !== "OWNER" && u.id !== actorId)
            .map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setChosen(u)}
                aria-pressed={chosen?.id === u.id}
              >
                <StaffIdentity user={u} />
                <span className="staff-status">
                  {chosen?.id === u.id ? currentRole : u.access.role}
                </span>
              </button>
            ))}
          {!results.some(
            (u) => u.access.role !== "OWNER" && u.id !== actorId,
          ) && (
            <StaffEmpty>
              No hay objetivos modificables en esta página. Busca otra cuenta.
            </StaffEmpty>
          )}
        </div>
        <StaffPager
          {...{
            page: pagination.page,
            pages: pagination.totalPages,
            total: pagination.total,
          }}
          onPage={(p) => void search(p)}
          label="cuentas encontradas"
        />
        <form
          className="staff-role-change"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && chosen)
              void onAction(
                {
                  action: "setRole",
                  userId: chosen.id,
                  role,
                  publicReason: reason,
                },
                {
                  target: `${chosen.displayName ?? chosen.username} · ${chosen.draftoryIdentity?.publicId ?? chosen.id}`,
                  before: currentRole ?? "USER",
                  after: role,
                  consequence:
                    "El nuevo cargo determina el acceso administrativo según sus permisos efectivos.",
                },
              );
          }}
        >
          {chosen ? (
            <div className="staff-identity-preview">
              <StaffIdentity user={chosen} size={40} />
              <span className="staff-status">Actual: {currentRole}</span>
            </div>
          ) : (
            <p className="staff-form-step">
              Selecciona una cuenta para continuar.
            </p>
          )}
          <fieldset disabled={!chosen || busy || !editable}>
            <legend>Nuevo cargo</legend>
            <div className="staff-role-options">
              {roles.map((r) => (
                <label key={r.id} data-selected={role === r.id}>
                  <input
                    type="radio"
                    name="role"
                    value={r.id}
                    checked={role === r.id}
                    onChange={() => setRole(r.id)}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="staff-field">
            Motivo del cambio
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              placeholder="Explica por qué se asigna o retira este cargo."
              disabled={!chosen || !editable}
            />
            <small>Quedará registrado en la auditoría administrativa.</small>
          </label>
          {chosen && (
            <div className="staff-change-preview">
              <span>{currentRole}</span>
              <ArrowRight size={16} />
              <strong>{role}</strong>
            </div>
          )}
          <StaffButton
            type="submit"
            variant={role === "USER" ? "danger" : "primary"}
            loading={busy}
            disabled={!valid}
          >
            <ShieldCheck size={16} />
            Revisar asignación
          </StaffButton>
        </form>
      </section>
      <section
        className="staff-surface staff-permissions-editor"
        aria-labelledby="permissions-title"
      >
        <div className="staff-section-heading">
          <div>
            <p className="dashboard-label">02 · ALCANCE DEL ROL</p>
            <h2 id="permissions-title">Capacidades por rol</h2>
          </div>
          <KeyRound size={21} />
        </div>
        <p className="staff-help">
          Los valores efectivos provienen del servidor. Una excepción sustituye
          el valor predeterminado; no se conceden permisos al navegar.
        </p>
        <div className="staff-role-tabs" aria-label="Rol a consultar">
          {["HELPER", "MODERATOR", "ADMIN"].map((r) => (
            <StaffButton
              key={r}
              type="button"
              variant={permissionRole === r ? "primary" : "quiet"}
              aria-pressed={permissionRole === r}
              onClick={() => {
                setPermissionRole(r);
                setChange(null);
                setPermissionReason("");
              }}
            >
              {r}
            </StaffButton>
          ))}
        </div>
        <label className="staff-search-row">
          <span className="sr-only">Filtrar permisos</span>
          <Search size={16} />
          <input
            placeholder="Buscar una capacidad o categoría"
            value={permissionFilter}
            onChange={(e) => setPermissionFilter(e.target.value)}
          />
        </label>
        <div className="staff-permission-list">
          {[
            ...new Set(filteredPermissions.map((p) => group(p.permission))),
          ].map((category) => (
            <details key={category} open={permissionFilter ? true : undefined}>
              <summary>
                <strong>{category}</strong>
                <span>
                  {
                    filteredPermissions.filter(
                      (p) => group(p.permission) === category,
                    ).length
                  }{" "}
                  capacidades
                </span>
                <ChevronDown
                  size={17}
                  className="staff-permission-chevron"
                  aria-hidden="true"
                />
              </summary>
              <div className="staff-permission-content">
                {filteredPermissions
                  .filter((p) => group(p.permission) === category)
                  .map((p) => (
                    <div className="staff-permission-row" key={p.permission}>
                      <div>
                        <strong>{staffPermissionLabels[p.permission]}</strong>
                        <p>{permissionHelp[p.permission]}</p>
                        <small>
                          {p.source === "EXCEPTION"
                            ? "Excepción configurada"
                            : "Predeterminado"}{" "}
                          · Base: {p.baseline ? "permitido" : "denegado"}
                        </small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.allowed}
                        aria-label={`${staffPermissionLabels[p.permission]} para ${permissionRole}`}
                        disabled={
                          !permissionEditable ||
                          p.permission === "permissions.configure" ||
                          busy
                        }
                        onClick={() => {
                          setChange({
                            permission: p.permission,
                            allowed: !p.allowed,
                          });
                          setPermissionReason("");
                        }}
                      >
                        <span />
                        {p.allowed ? "Permitido" : "Denegado"}
                      </button>
                    </div>
                  ))}
              </div>
            </details>
          ))}
          {!filteredPermissions.length && (
            <StaffEmpty>No hay capacidades que coincidan.</StaffEmpty>
          )}
        </div>
        {change && chosenPolicy && (
          <form
            className="staff-permission-preview"
            onSubmit={(e) => {
              e.preventDefault();
              if (permissionReason.trim().length >= 3)
                void onAction(
                  {
                    action: "setPermission",
                    role: permissionRole,
                    permission: change.permission,
                    allowed: change.allowed,
                    publicReason: permissionReason,
                  },
                  {
                    target: permissionRole,
                    before: chosenPolicy.allowed ? "Permitido" : "Denegado",
                    after: change.allowed ? "Permitido" : "Denegado",
                    consequence: `Se actualizará ${staffPermissionLabels[change.permission]} para todos los miembros de este rol. Las restricciones de jerarquía y del OWNER siguen vigentes.`,
                  },
                );
            }}
          >
            <h3>Vista previa del cambio</h3>
            <p>
              {staffPermissionLabels[change.permission]} · {permissionRole}
            </p>
            <div className="staff-change-preview">
              <span>{chosenPolicy.allowed ? "Permitido" : "Denegado"}</span>
              <ArrowRight size={16} />
              <strong>{change.allowed ? "Permitido" : "Denegado"}</strong>
            </div>
            <label className="staff-field">
              Motivo
              <input
                value={permissionReason}
                onChange={(e) => setPermissionReason(e.target.value)}
                required
                minLength={3}
                maxLength={500}
              />
            </label>
            <div className="staff-form-actions">
              <StaffButton
                type="button"
                variant="quiet"
                onClick={() => setChange(null)}
              >
                Descartar
              </StaffButton>
              <StaffButton
                type="submit"
                variant={change.allowed ? "primary" : "danger"}
                loading={busy}
                disabled={
                  permissionReason.trim().length < 3 ||
                  change.allowed === chosenPolicy.allowed
                }
              >
                <Save size={15} />
                Revisar permiso
              </StaffButton>
            </div>
          </form>
        )}
      </section>
      <section className="staff-surface staff-member-section">
        <div className="staff-section-heading">
          <div>
            <p className="dashboard-label">EQUIPO DE DRAFTORY</p>
            <h2>
              Miembros del Staff{" "}
              <span className="staff-status">{feed.metrics.staffCount}</span>
            </h2>
          </div>
          <ShieldCheck size={21} />
        </div>
        <label className="staff-search-row">
          <Search size={16} />
          <input
            aria-label="Filtrar miembros del Staff"
            placeholder="Buscar miembro o cargo"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          />
        </label>
        <div className="staff-members">
          {feed.staffMembers
            .filter((m) =>
              `${m.user.displayName} ${m.user.username} ${m.user.draftoryIdentity?.publicId} ${m.role}`
                .toLowerCase()
                .includes(memberFilter.toLowerCase()),
            )
            .map((m) => (
              <details key={m.userId}>
                <summary>
                  <StaffIdentity user={m.user} />
                  <span className="staff-member-role">{m.role}</span>
                  <span className="staff-status staff-status--success">
                    Vigente
                  </span>
                  <ChevronDown size={16} />
                </summary>
                <div className="staff-member-detail">
                  <div className="staff-member-identity">
                    <StaffRoleBadge role={m.role} />
                    <Link href={`/profile/${m.userId}`}>Abrir perfil ↗</Link>
                    {m.role === "OWNER" && (
                      <span>
                        <LockKeyhole size={13} />
                        Propietario protegido
                      </span>
                    )}
                  </div>
                  <h3>Permisos efectivos · {m.access.permissions.length}</h3>
                  <div className="staff-permission-tags">
                    {m.access.permissions.map((p) => (
                      <span key={p}>{staffPermissionLabels[p]}</span>
                    ))}
                  </div>
                  {m.role !== "OWNER" && m.userId !== actorId && editable && (
                    <StaffButton
                      type="button"
                      variant="danger"
                      onClick={() => {
                        const found = feed.users.find((u) => u.id === m.userId);
                        setRole("USER");
                        roleEditor.current?.scrollIntoView({ block: "start" });
                        if (found) {
                          setChosen(found);
                        } else {
                          setQuery(
                            m.user.draftoryIdentity?.publicId ?? m.userId,
                          );
                          setError(
                            "Busca esta identidad arriba para revisar su cuenta antes de retirar el rol.",
                          );
                        }
                      }}
                    >
                      Preparar retirada de cargo
                    </StaffButton>
                  )}
                </div>
              </details>
            ))}
        </div>
      </section>
    </div>
  );
}
