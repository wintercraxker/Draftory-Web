"use client";
import { StaffEntryError } from "../auth/StaffEntryError";
import { AccessScreen, StaffLoading } from "../auth/AccessScreen";
import { useStaffEntryTransition } from "./useStaffEntryTransition";
import { initializeSounds, playSound } from "@/lib/sounds/engine";
import Link from "next/link";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { validStaffAccess, validStaffFeed } from "@/lib/staff-response";
import { StaffIdentity } from "./StaffIdentity";
import { StaffMmr } from "./StaffMmr";
import { StaffBots } from "./StaffBots";
import { StaffReports } from "./StaffReports";
import { StaffSanctions } from "./StaffSanctions";
import { StaffRooms } from "./StaffRooms";
import Image from "next/image";
import { StaffRoleBadge } from "./ProfileRecognition";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Menu,
  X,
  RefreshCw,
  Activity,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { StaffConfirmation } from "./StaffConfirmation";
import { InterventionDialog } from "./InterventionDialog";
import type { SanctionDraft } from "./SanctionForm";
import { useStaffDrafts } from "./useStaffDrafts";
import { StaffManagement, type ActionContext } from "./StaffManagement";
import { StaffPager, StaffEmpty } from "./StaffUi";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Search,
  Users,
  Flag,
  ScrollText,
  LockKeyhole,
  DoorOpen,
  ArrowLeft,
} from "lucide-react";
import type { staffDashboard } from "@/lib/real/staff-repository";
import type { StaffPermission } from "@/lib/real/staff-access";
type Feed = Awaited<ReturnType<typeof staffDashboard>>;
const input = "staff-input";
const button = "staff-button staff-button--secondary";
const primaryButton = "staff-button staff-button--primary";
const dangerButton = "staff-button staff-button--danger";
const date = (v: Date | string | null) =>
  v ? new Date(v).toLocaleString("es-CO") : "Sin vencimiento";

export function StaffPanel({
  initialReport = "",
  initialTab = "",
}: { initialReport?: string; initialTab?: string } = {}) {
  const { user } = useAuth();
  // Private drafts live only in this mounted workspace, keyed by the subject.
  const [interventionDrafts, setInterventionDrafts] = useState<
    Record<string, SanctionDraft>
  >({});
  const reportIds = useRef<Set<string> | null>(null);
  const busyRef = useRef(false),
    loadVersion = useRef(0);
  const [accessStatus, setAccessStatus] = useState<number>();
  const [access, setAccess] = useState<Feed["access"]>(),
    [loadIssue, setLoadIssue] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>(),
    [pendingContext, setPendingContext] = useState<ActionContext>();
  const [listPage, setListPage] = useState(1);
  const [userFilter, setUserFilter] = useState("");
  const [activeReport, setActiveReport] = useState(initialReport);
  const [mobileOpen, setMobileOpen] = useState(false),
    [filter, setFilter] = useState("");
  const [feed, setFeed] = useState<Feed>(),
    [tab, setTab] = useState(
      initialReport ? "reports" : initialTab === "bots" ? "bots" : "overview",
    ),
    [search, setSearch] = useState(""),
    [target, setTarget] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (tab !== "reports" || !activeReport) return;
    const el = document.getElementById("staff-report-" + activeReport);
    if (el) {
      el.setAttribute("open", "");
      el.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }, [tab, activeReport]);
  const load = useCallback(async (q: string, page = 1) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadIssue("");
    setAccessStatus(undefined);
    let permissionsConfirmed = false;
    const failure = (status: number) =>
      status === 401
        ? "Tu sesión ha caducado. Inicia sesión con Steam de nuevo."
        : status === 403
          ? "Acceso restringido: el servidor no autoriza esta consulta."
          : status === 429
            ? "Se alcanzó el límite de consultas. Espera un minuto y vuelve a intentar."
            : "No se pudo cargar este módulo. Puedes reintentar; no se han cambiado tus permisos.";
    try {
      const permissionResponse = await fetch("/api/staff/access", {
        cache: "no-store",
      });
      if (version !== loadVersion.current) return;
      if (!permissionResponse.ok) {
        setAccessStatus(permissionResponse.status);
        throw Error(failure(permissionResponse.status));
      }
      const permissionData = await permissionResponse.json();
      if (
        !validStaffAccess(permissionData) ||
        typeof permissionData.canAccessStaff !== "boolean"
      )
        throw Error(
          "La comprobación de acceso devolvió una respuesta incompleta. Vuelve a intentar.",
        );
      if (!permissionData.canAccessStaff) {
        setAccessStatus(403);
        setAccess(undefined);
        setFeed(undefined);
        throw Error(failure(403));
      }
      permissionsConfirmed = true;
      setAccess(permissionData);
      const r = await fetch(
        `/api/staff?search=${encodeURIComponent(q)}&page=${page}`,
        { cache: "no-store" },
      );
      if (version !== loadVersion.current) return;
      if (!r.ok) {
        setAccessStatus(r.status);
        if (r.status === 401 || r.status === 403) {
          permissionsConfirmed = false;
          setAccess(undefined);
        }
        throw Error(failure(r.status));
      }
      const value = await r.json();
      if (version !== loadVersion.current) return;
      if (!validStaffFeed(value))
        throw Error(
          "El servidor devolvió datos incompletos del panel. Vuelve a intentar.",
        );
      setAccess(value.access);
      setFeed(value);
      setUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (version === loadVersion.current) {
        setFeed(undefined);
        if (!permissionsConfirmed) setAccess(undefined);
        setLoadIssue(
          error instanceof SyntaxError
            ? "El servidor devolvi? una respuesta incompleta. Vuelve a intentar."
            : error instanceof TypeError
              ? "No se pudo conectar con el servidor. Vuelve a intentar."
              : error instanceof Error
                ? error.message
                : "No se pudo conectar con el servidor. Vuelve a intentar.",
        );
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(""), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const can = (p: StaffPermission) => access?.permissions.includes(p) ?? false;
  const selected = feed?.users.find((u) => u.id === target);
  useStaffDrafts(tab, target);
  const roleOrder = ["USER", "HELPER", "MODERATOR", "ADMIN", "OWNER"];
  const canIntervene = Boolean(
    selected &&
    selected.id !== user?.id &&
    roleOrder.indexOf(feed?.access.role ?? "USER") >
      roleOrder.indexOf(selected.access.role) &&
    ["users.warn", "users.mute", "users.suspend", "users.ban"].some((p) =>
      can(p as StaffPermission),
    ),
  );
  const [actionError, setActionError] = useState("");
  const [returnReport, setReturnReport] = useState("");
  const [pendingAction, setPendingAction] = useState<Record<
    string,
    unknown
  > | null>(null);
  async function act(
    payload: Record<string, unknown>,
    context?: ActionContext,
  ) {
    if (!busyRef.current) {
      setActionError("");
      setPendingContext(context);
      const requestId = crypto.randomUUID();
      setPendingAction({
        ...payload,
        requestId,
        ...(payload.reportId &&
        ["warn", "mute", "suspend", "ban"].includes(String(payload.action))
          ? { interventionId: requestId + "_prepare" }
          : {}),
      });
    }
  }
  async function commit(payload: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    setActionError("");
    try {
      if (
        payload.reportId &&
        ["warn", "mute", "suspend", "ban"].includes(String(payload.action))
      ) {
        const prepared = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            action: "prepareReportIntervention",
            interventionAction: payload.action,
            requestId: payload.interventionId,
          }),
        });
        const preparedValue = await prepared.json();
        if (!prepared.ok)
          throw Error(
            preparedValue.error || "No se pudo preparar la intervención.",
          );
      }
      const r = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error || "No se pudo guardar la operación.");
      if (
        !v ||
        typeof v !== "object" ||
        (["assignReport", "resolveReport"].includes(String(payload.action)) &&
          v.ok !== true)
      )
        throw Error(
          "No se pudo confirmar la operación. Actualiza el caso antes de continuar.",
        );
      void playSound(
        "confirmation",
        "staff",
        String(payload.requestId) + ":success",
      );
      setPendingAction(null);
      pendingContext?.onSuccess?.();
      setNotice("Acción guardada y auditada.");
      await load(search);
    } catch (e) {
      void playSound("error", "staff", String(payload.requestId) + ":error");
      const message =
        e instanceof TypeError
          ? "No se pudo conectar con el servidor. Tu texto se conserva; puedes reintentar la misma operación."
          : e instanceof SyntaxError
            ? "El servidor no pudo confirmar la operación. Tu texto se conserva."
            : e instanceof Error
              ? e.message
              : "No se pudo guardar.";
      setActionError(message);
      setNotice(message);
      if (payload.reportId) await load(search);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const tabs = [
    {
      id: "bots",
      label: "Bots",
      icon: Activity,
      show: access?.role === "OWNER",
    },
    {
      id: "mmr",
      label: "Verificación de MMR",
      icon: BadgeCheck,
      show: can("users.view"),
    },
    { id: "overview", label: "Resumen", icon: ShieldCheck, show: true },
    { id: "users", label: "Usuarios", icon: Users, show: can("users.view") },
    { id: "reports", label: "Reportes", icon: Flag, show: can("reports.view") },
    {
      id: "sanctions",
      label: "Sanciones",
      icon: LockKeyhole,
      show: can("history.view"),
    },
    {
      id: "rooms",
      label: "Salas y mensajes",
      icon: DoorOpen,
      show:
        can("rooms.moderate") || can("rooms.kick") || can("messages.moderate"),
    },
    {
      id: "staff",
      label: "Staff y permisos",
      icon: ShieldCheck,
      show: access?.role === "OWNER",
    },
    {
      id: "audit",
      label: "Auditoría",
      icon: ScrollText,
      show: can("audit.view"),
    },
  ];
  useEffect(() => {
    initializeSounds();
  }, []);
  useEffect(() => {
    if (!feed || !access?.permissions.includes("reports.view")) return;
    const item = feed.reports.find(
      (r) =>
        reportIds.current &&
        !reportIds.current.has(r.id) &&
        Date.parse(String(r.createdAt)) > Date.now() - 120000,
    );
    if (item)
      void playSound("notification", "staff", "report-alert:" + item.id);
    reportIds.current = new Set(feed.reports.map((r) => r.id));
  }, [feed, access]);
  const reportRows =
    feed?.reports.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];
  const sanctionRows =
    feed?.sanctions.filter((s) =>
      JSON.stringify({
        ...s,
        effectiveState:
          s.state === "ACTIVE" && s.endsAt && new Date(s.endsAt) < new Date()
            ? "CADUCADA"
            : s.state,
      })
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  const auditRows =
    feed?.audit.filter((a) =>
      JSON.stringify(a).toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];
  const rows =
    tab === "reports"
      ? reportRows
      : tab === "sanctions"
        ? sanctionRows
        : auditRows;
  const pages = Math.max(1, Math.ceil(rows.length / 10)),
    currentPage = Math.min(listPage, pages);
  const entry = useStaffEntryTransition(
    Boolean(feed && access && !loading),
    Boolean(loadIssue || accessStatus === 401 || accessStatus === 403),
  );
  if (accessStatus === 401) return <AccessScreen />;
  if (accessStatus === 403) return <AccessScreen denied />;
  if (entry.visible) return <StaffLoading exiting={entry.exiting} />;
  if (!feed && loadIssue)
    return <StaffEntryError retry={() => void load(search)} busy={loading} />;
  return (
    <div className="staff-shell">
      <button
        className="staff-mobile-toggle"
        aria-label={mobileOpen ? "Cerrar navegación" : "Abrir navegación"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <aside className={"staff-sidebar " + (mobileOpen ? "is-open" : "")}>
        <Link href="/staff" className="staff-brand">
          <Image src="/favicon.ico" width={32} height={32} alt="" />
          <span>
            draftory<span className="staff-wordmark-suffix">.lol</span>
            <small>STAFF · COMUNIDAD</small>
          </span>
        </Link>
        <p className="staff-nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Secciones de moderación">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setFilter("");
                  setListPage(1);
                  setMobileOpen(false);
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                aria-current={tab === t.id ? "page" : undefined}
              >
                <t.icon size={18} />
                <span>{t.label}</span>
                {t.id === "reports" && !!feed?.metrics.pending && (
                  <b>{feed.metrics.pending}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="staff-sidebar-bottom">
          <span>
            <span className="staff-live-dot" /> Sesión protegida · Steam
          </span>
          <Link href="/dashboard">
            <ArrowLeft size={16} />
            Volver a Draftory
          </Link>
        </div>
      </aside>
      <main className="staff-workspace space-y-7" aria-busy={busy}>
        {pendingAction && (
          <StaffConfirmation
            context={
              pendingContext ?? {
                target:
                  feed?.users.find((u) => u.id === pendingAction.userId)
                    ?.displayName ??
                  feed?.staffMembers.find(
                    (u) => u.userId === pendingAction.userId,
                  )?.user.displayName ??
                  undefined,
              }
            }
            payload={pendingAction}
            busy={busy}
            error={actionError}
            onCancel={() => {
              if (!busyRef.current) setPendingAction(null);
            }}
            onConfirm={(ownerConfirmed) =>
              void commit({
                ...pendingAction,
                ...(pendingContext?.ownerExceptionRequired
                  ? { ownerExceptionConfirmed: ownerConfirmed === true }
                  : {}),
              })
            }
          />
        )}
        <header className="staff-header">
          <div>
            <p className="staff-eyebrow">
              ADMINISTRACIÓN <ChevronRight size={12} />{" "}
              {tabs.find((t) => t.id === tab)?.label}
            </p>
            <h1>{tabs.find((t) => t.id === tab)?.label ?? "Resumen"}</h1>
            <p>
              Control de comunidad · Decisiones con contexto y trazabilidad.
            </p>
            {updatedAt && (
              <time className="staff-update-time" dateTime={updatedAt}>
                Actualizado a las{" "}
                {new Date(updatedAt).toLocaleTimeString("es-CO")}
              </time>
            )}
          </div>
          <div className="staff-account">
            <StaffIdentity
              user={{
                id: user?.id,
                displayName: user?.name ?? "Staff",
                avatar: user?.avatar,
              }}
              size={40}
              avatarOnly
            />
            <div>
              <div className="staff-account-name">
                <strong>{user?.name ?? "Staff"}</strong>
                {access && <StaffRoleBadge role={access.role} />}
              </div>
              <span>
                {access?.role ??
                  (loading ? "Verificando acceso" : "Acceso sin verificar")}
              </span>
            </div>
            <button
              title="Actualizar datos"
              aria-label="Actualizar datos"
              disabled={loading}
              onClick={() => void load(search)}
            >
              <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>
        {loadIssue && (
          <div role="alert" className="staff-alert staff-alert--error">
            <p>{loadIssue}</p>
            <button
              className={button}
              disabled={loading}
              onClick={() => void load(search)}
            >
              Reintentar carga
            </button>
          </div>
        )}
        {feed?.moduleErrors.includes(tab) && (
          <div role="alert" className="staff-alert staff-alert--error">
            <p>
              Este módulo no está disponible temporalmente. Los demás módulos
              autorizados siguen disponibles.
            </p>
            <button
              className={button}
              disabled={loading}
              onClick={() => void load(search)}
            >
              Reintentar módulo
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className={
              "staff-alert " +
              (notice === "Acción guardada y auditada."
                ? "staff-alert--success"
                : "staff-alert--error")
            }
          >
            {notice}
          </p>
        )}
        {tab === "mmr" && access && (
          <StaffMmr role={access.role} canVerify={can("mmr.verify")} />
        )}
        {tab === "bots" && access?.role === "OWNER" && <StaffBots />}
        {loading && !feed && (
          <p role="status" className="animate-pulse py-12 text-zinc-400">
            Consultando actividad de la comunidad…
          </p>
        )}
        {feed &&
          tab === "overview" &&
          !feed.moduleErrors.includes("overview") && (
            <>
              <section className="staff-metrics">
                {[
                  [
                    "Usuarios registrados",
                    feed.metrics.registered,
                    Users,
                    "Cuentas de la comunidad",
                  ],
                  [
                    "Cuentas suspendidas",
                    feed.metrics.suspended,
                    LockKeyhole,
                    "Suspensiones vigentes",
                  ],
                  [
                    "Reportes pendientes",
                    feed.metrics.pending,
                    Flag,
                    "Requieren revisión",
                  ],
                  [
                    "Reportes resueltos",
                    feed.metrics.resolved,
                    CheckCircle2,
                    "Con resolución registrada",
                  ],
                  [
                    "Salas activas",
                    feed.metrics.activeRooms,
                    DoorOpen,
                    "Actividad actual",
                  ],
                  [
                    "Miembros del Staff",
                    feed.metrics.staffCount,
                    ShieldCheck,
                    "Roles no revocados",
                  ],
                ].map(([label, value, Icon, detail]) => {
                  const MetricIcon = Icon as typeof Users;
                  return (
                    <article key={String(label)} className="staff-metric">
                      <div>
                        <span>{String(label)}</span>
                        <MetricIcon size={19} />
                      </div>
                      <strong>{value === null ? "—" : String(value)}</strong>
                      <small>{String(detail)}</small>
                    </article>
                  );
                })}
              </section>
              <section className="staff-overview-columns">
                <div className="staff-surface">
                  <div className="staff-section-heading">
                    <h2>Centro de atención</h2>
                    <span>{feed.metrics.pending ?? "—"} pendientes</span>
                  </div>
                  {feed.reports
                    .filter((r) => r.status === "OPEN")
                    .slice(0, 5)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setActiveReport(r.id);
                          setListPage(1);
                          setTab("reports");
                        }}
                        className="staff-case"
                      >
                        <Flag size={18} />
                        <span>
                          <span className="staff-case-top">
                            <strong>{r.subject}</strong>
                            <em>Pendiente</em>
                          </span>
                          <small>
                            {r.reportedUser.displayName} · {r.category}
                          </small>
                          <time dateTime={String(r.createdAt)}>
                            {date(r.createdAt)}
                          </time>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!feed.reports.some((r) => r.status === "OPEN") && (
                    <Empty text="Bandeja al día. No hay reportes pendientes en tu vista." />
                  )}
                </div>
                <div className="staff-surface">
                  <div className="staff-section-heading">
                    <h2>Accesos rápidos</h2>
                    <Activity size={18} />
                  </div>
                  <div className="staff-shortcuts">
                    {tabs
                      .filter(
                        (t) =>
                          t.show &&
                          ["users", "sanctions", "staff", "audit"].includes(
                            t.id,
                          ),
                      )
                      .map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)}>
                          <t.icon size={20} />
                          <span>{t.label}</span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                  </div>
                  <p className="staff-policy">
                    Las partidas iniciadas conservan su roster y resultado.
                    Moderar una cuenta no altera una partida en curso.
                  </p>
                </div>
              </section>
              {can("history.view") && (
                <section className="staff-surface">
                  <div className="staff-section-heading">
                    <h2>Intervenciones recientes</h2>
                    <button onClick={() => setTab("sanctions")}>
                      Consultar sanciones →
                    </button>
                  </div>
                  {feed.sanctions.slice(0, 4).map((r) => (
                    <div key={r.id} className="staff-case">
                      <LockKeyhole size={17} />
                      <span>
                        <strong>
                          {r.kind} · {r.userId}
                        </strong>
                        <small>{r.publicReason}</small>
                      </span>
                      <small>{date(r.startsAt)}</small>
                    </div>
                  ))}
                  {!feed.sanctions.length && (
                    <Empty text="No hay sanciones registradas." />
                  )}
                </section>
              )}
            </>
          )}
        {tab === "overview" &&
          !feed?.moduleErrors.includes("overview") &&
          feed &&
          can("audit.view") && (
            <section className="border-t border-zinc-800 pt-6">
              <h2 className="mb-4 text-lg font-semibold">
                Actividad e incidentes recientes
              </h2>
              {feed.audit
                .filter(
                  (a) => a.action !== "readStaff" && a.action !== "searchStaff",
                )
                .slice(0, 6)
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setTab("audit")}
                    className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-zinc-800 py-3 text-left text-sm hover:bg-zinc-900"
                  >
                    <span>{a.reason}</span>
                    <span
                      className={
                        a.result === "REJECTED"
                          ? "text-amber-400"
                          : "text-zinc-500"
                      }
                    >
                      {a.result} · {date(a.createdAt)}
                    </span>
                  </button>
                ))}
              {!feed.audit.some(
                (a) => a.action !== "readStaff" && a.action !== "searchStaff",
              ) && <Empty text="No hay intervenciones recientes." />}
            </section>
          )}
        {tab === "users" && !feed?.moduleErrors.includes("users") && (
          <label className="staff-filter">
            Estado de las cuentas cargadas
            <DashboardDropdown
              fullWidth
              className="staff-select"
              label="Filtrar usuarios"
              value={userFilter}
              onChange={setUserFilter}
              options={[
                { value: "", label: "Todos los estados" },
                { value: "Activa", label: "Activa" },
                { value: "Suspendida", label: "Suspendida" },
                { value: "Chat silenciado", label: "Chat silenciado" },
                { value: "STAFF", label: "Miembros del Staff" },
              ]}
            />
          </label>
        )}
        {tab === "users" && !feed?.moduleErrors.includes("users") && (
          <>
            {returnReport && (
              <button
                className={button}
                onClick={() => {
                  setActiveReport(returnReport);
                  setTab("reports");
                  setSearch("");
                  void load("");
                }}
              >
                ← Volver al reporte
              </button>
            )}
            <form
              className="staff-users-search flex gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void load(search);
              }}
            >
              <label className="staff-search-row flex-1">
                <span className="sr-only">Buscar usuarios</span>
                <Search size={16} className="text-zinc-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={128}
                  placeholder="Nombre, SteamID64, ID interno o DF-ID"
                  className={input}
                />
              </label>
              <button
                disabled={loading || !can("users.search")}
                className={button}
              >
                Buscar
              </button>
            </form>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section className="overflow-hidden rounded-xl border border-zinc-800">
                {feed?.users
                  .filter(
                    (u) =>
                      !userFilter ||
                      (userFilter === "STAFF"
                        ? u.access.role !== "USER"
                        : u.accountState === userFilter),
                  )
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setTarget(u.id);
                        setSearch(u.id);
                        void load(u.id);
                      }}
                      className={`flex w-full items-center justify-between gap-4 border-b border-zinc-800 p-4 text-left hover:bg-zinc-900 ${target === u.id ? "bg-zinc-900" : ""}`}
                    >
                      <StaffIdentity
                        user={u}
                        detail={[
                          u.draftoryIdentity?.publicId,
                          u.steamId ?? u.id,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <span className="text-xs text-zinc-400">
                        {u.access.role}
                      </span>
                    </button>
                  ))}
                {!feed?.users.length && (
                  <Empty text="No se encontraron usuarios." />
                )}
              </section>
              {selected ? (
                <section
                  key={selected.id}
                  className="staff-account-detail staff-surface"
                >
                  <header className="staff-account-header">
                    <StaffIdentity user={selected} size={72} avatarOnly />
                    <div>
                      <p className="staff-eyebrow">INFORMACIÓN DE LA CUENTA</p>
                      <h2>{selected.displayName ?? selected.username}</h2>
                      <p className="staff-help">
                        {selected.draftoryIdentity?.publicId ?? "Sin DF-ID"}
                      </p>
                      <div className="staff-account-badges">
                        <span className="staff-status">
                          {selected.access.role === "USER"
                            ? "Usuario"
                            : selected.access.role}
                        </span>
                        <StaffRoleBadge role={selected.access.role} />
                        <span className="staff-status">
                          {selected.accountState}
                        </span>
                      </div>
                    </div>
                  </header>
                  <p className="staff-account-registration">
                    Registro: {date(selected.createdAt)} ·{" "}
                    <Link href={`/profile/${selected.id}`}>
                      Abrir perfil público ↗
                    </Link>
                  </p>
                  <details className="staff-account-permissions">
                    <summary>Estado y permisos efectivos</summary>
                    <p className="staff-help">
                      {selected.access.permissions.join(" · ") ||
                        "Sin permisos de staff"}
                    </p>
                  </details>
                  {canIntervene ? (
                    <InterventionDialog
                      user={selected}
                      key={selected.id}
                      userId={selected.id}
                      draft={interventionDrafts[`${user?.id}:${selected.id}`]}
                      onDraftChange={(draft) =>
                        setInterventionDrafts((previous) => {
                          const next = {
                            ...previous,
                            [`${user?.id}:${selected.id}`]: draft,
                          };
                          const keys = Object.keys(next);
                          if (keys.length > 100) delete next[keys[0]];
                          return next;
                        })
                      }
                      userName={selected.displayName ?? selected.username}
                      actions={["warn", "mute", "suspend", "ban"].filter((a) =>
                        can(
                          (
                            {
                              warn: "users.warn",
                              mute: "users.mute",
                              suspend: "users.suspend",
                              ban: "users.ban",
                            } as const
                          )[a as "warn" | "mute" | "suspend" | "ban"],
                        ),
                      )}
                      busy={busy}
                      serverNow={feed?.serverNow ?? new Date().toISOString()}
                      moderator={access?.role === "MODERATOR"}
                      onAction={(payload, context) =>
                        act(payload, {
                          ...context,
                          onSuccess: () => {
                            setInterventionDrafts((previous) => {
                              const next = { ...previous };
                              delete next[`${user?.id}:${selected.id}`];
                              return next;
                            });
                            context?.onSuccess?.();
                          },
                        })
                      }
                    />
                  ) : (
                    <p className="staff-help staff-readonly">
                      <ShieldCheck size={16} />
                      Solo lectura: tu cargo o la jerarquía de esta cuenta no
                      permiten aplicar sanciones.
                    </p>
                  )}
                  {selected.manualMedal && can("medals.verify") && (
                    <ActionForm
                      title={`Validar medalla ${selected.manualMedal.rankTier}`}
                      action="verifyMedal"
                      fields={[]}
                      busy={busy}
                      submit={(p) => act({ ...p, userId: target })}
                    />
                  )}
                  <details className="staff-account-history">
                    <summary>Historial de moderación y actividad</summary>
                    {feed?.sanctions
                      .filter((s) => s.userId === target)
                      .map((s) => (
                        <p
                          key={s.id}
                          className="mt-3 border-l border-amber-700 pl-3 text-sm text-zinc-400"
                        >
                          {s.kind} · {s.publicReason}
                          <span className="mt-1 block text-xs">
                            {date(s.startsAt)} → {date(s.endsAt)} · {s.state}
                          </span>
                        </p>
                      ))}
                    {feed?.history
                      .filter((h) => h.userId === target)
                      .map((h) => (
                        <p
                          key={h.matchId}
                          className="mt-3 break-all text-xs text-zinc-500"
                        >
                          Partida {h.matchId} · {h.teamSide} · {h.match.status}
                        </p>
                      ))}
                  </details>
                </section>
              ) : (
                <Empty text="Selecciona un usuario para revisar su cuenta." />
              )}
            </div>
          </>
        )}
        {tab === "users" && !feed?.moduleErrors.includes("users") && feed && (
          <StaffPager
            page={feed.pagination.page}
            pages={feed.pagination.totalPages}
            total={feed.pagination.total}
            label="usuarios encontrados"
            onPage={(p) => void load(search, p)}
          />
        )}
        {feed && ["sanctions", "audit"].includes(tab) && (
          <label className="staff-filter">
            <Search size={17} />
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setListPage(1);
              }}
              placeholder={
                tab === "sanctions"
                  ? "Filtrar por usuario, tipo, estado o vencimiento"
                  : tab === "reports"
                    ? "Filtrar por estado, responsable, categoría o usuario"
                    : "Filtrar por actor, acción, resultado o permiso"
              }
            />
            <small>Registros recientes cargados</small>
          </label>
        )}
        {access && can("reports.view") && (
          <section hidden={tab !== "reports"}>
            <StaffReports
              actorId={user?.id ?? ""}
              canViewUser={can("users.view")}
              revision={updatedAt}
              busy={busy}
              canResolve={can("reports.resolve")}
              activeId={activeReport}
              onAction={act}
              onUser={(id, reportId) => {
                setReturnReport(reportId);
                setActiveReport(reportId);
                setTarget(id);
                setSearch(id);
                setTab("users");
                void load(id);
              }}
            />
          </section>
        )}
        {tab === "sanctions" &&
          feed &&
          !feed.moduleErrors.includes("sanctions") && (
            <StaffSanctions
              now={feed.serverNow}
              rows={sanctionRows.slice(
                (currentPage - 1) * 10,
                currentPage * 10,
              )}
              busy={busy}
              canRevoke={can("users.revoke")}
              onAction={act}
            />
          )}
        {tab === "rooms" && !feed?.moduleErrors.includes("rooms") && feed && (
          <StaffRooms feed={feed} busy={busy} onAction={act} />
        )}
        {feed &&
          feed.access.role === "OWNER" &&
          !feed.moduleErrors.includes("staff") && (
            <section hidden={tab !== "staff"}>
              <StaffManagement
                feed={feed}
                busy={busy}
                actorId={user?.id}
                onAction={act}
              />
            </section>
          )}
        {tab === "audit" && !feed?.moduleErrors.includes("audit") && (
          <section>
            {auditRows
              .slice((currentPage - 1) * 10, currentPage * 10)
              .map((a) => (
                <details key={a.id} className="border-b border-zinc-800 py-4">
                  <summary className="cursor-pointer text-sm">
                    <span className="mr-3 text-amber-500">{a.action}</span>
                    {a.reason}
                    <span className="mt-2 block text-xs text-zinc-500">
                      {date(a.createdAt)} · {a.result}
                    </span>
                  </summary>
                  <div className="staff-case-identities">
                    <StaffIdentity user={a.actor} />
                    {a.target && <StaffIdentity user={a.target} />}
                  </div>
                  <p className="mt-3 break-all text-xs text-zinc-400">
                    Actor: {a.actor.displayName ?? a.actorId} · Objetivo:{" "}
                    {a.target?.displayName ?? a.targetId ?? "—"} · Permiso:{" "}
                    {a.permission}
                  </p>
                  <pre className="mt-3 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
                    {JSON.stringify(a.changes, null, 2)}
                  </pre>
                </details>
              ))}
            {!auditRows.length && (
              <Empty text="No hay acciones administrativas registradas." />
            )}
          </section>
        )}
        {feed && ["sanctions", "audit"].includes(tab) && (
          <StaffPager
            page={currentPage}
            pages={pages}
            total={rows.length}
            onPage={setListPage}
            label="registros recientes"
          />
        )}
      </main>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <StaffEmpty>{text}</StaffEmpty>;
}
function ActionForm({
  title,
  action,
  fields,
  busy,
  submit,
}: {
  title: string;
  action: string;
  fields: string[];
  busy: boolean;
  submit: (p: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <form
      className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          action,
          ...Object.fromEntries(new FormData(e.currentTarget)),
        });
      }}
    >
      <h2 className="font-semibold">{title}</h2>
      {fields.map((f) => (
        <input
          key={f}
          name={f}
          required
          maxLength={128}
          aria-label={f}
          placeholder={
            {
              roomId: "ID interno de sala",
              userId: "ID interno del usuario",
              messageId: "ID del mensaje",
            }[f]
          }
          className={input}
        />
      ))}
      <textarea
        name="publicReason"
        required
        maxLength={500}
        aria-label="Motivo"
        placeholder="Motivo obligatorio"
        className={input}
      />
      <button
        disabled={busy}
        className={action === "verifyMedal" ? primaryButton : dangerButton}
      >
        Aplicar y auditar
      </button>
    </form>
  );
}
