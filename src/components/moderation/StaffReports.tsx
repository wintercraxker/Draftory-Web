"use client";
import { ReportInterventions } from "./ReportInterventions";
import { InterventionDialog } from "./InterventionDialog";
import { reportDecisions } from "@/lib/report-decisions";
import { EvidenceGallery } from "./EvidenceGallery";
import { validStaffReports } from "@/lib/staff-response";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Flag,
  X,
  ChevronRight,
  CalendarClock,
  SlidersHorizontal,
  RotateCcw,
  Paperclip,
  UserRoundCheck,
  FileText,
} from "lucide-react";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { StaffIdentity } from "./StaffIdentity";
import { StaffButton, StaffEmpty, StaffPager } from "./StaffUi";
import type { staffReports } from "@/lib/real/staff-repository";
import type { ActionContext } from "./StaffManagement";
type Result = Awaited<ReturnType<typeof staffReports>>;
const emptyFilters = {
  search: "",
  status: "",
  category: "",
  assignee: "",
  user: "",
};
const categoryLabels: Record<string, string> = {
  conducta: "Conducta",
  acoso: "Acoso",
  abuso: "Abuso",
  spam: "Spam",
  abandono: "Abandono",
  suplantacion: "Suplantación",
  otro: "Otro",
};
const categoryLabel = (value: string) =>
  categoryLabels[value] ||
  value.charAt(0).toLocaleUpperCase("es") + value.slice(1);
export function StaffReports({
  actorId,
  canResolve,
  busy,
  activeId,
  onAction,
  onUser,
  revision,
  canViewUser,
}: {
  actorId: string;
  canResolve: boolean;
  busy: boolean;
  activeId: string;
  revision?: string;
  onAction: (
    p: Record<string, unknown>,
    context?: ActionContext,
  ) => Promise<void>;
  onUser: (id: string, reportId: string) => void;
  canViewUser: boolean;
}) {
  const [data, setData] = useState<Result>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [selected, setSelected] = useState("");
  const [filters, setFilters] = useState({
      search: activeId || "",
      status: "",
      category: "",
      assignee: "",
      user: "",
    }),
    [applied, setApplied] = useState(filters),
    [page, setPage] = useState(1);
  const version = useRef(0);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ ...applied, page: String(page) });
      const r = await fetch("/api/staff/reports?" + q, { cache: "no-store" });
      const v = await r.json();
      if (current !== version.current) return;
      if (!r.ok) {
        setData(undefined);
        throw Error(v.error || "No se pudieron consultar los reportes.");
      }
      if (!validStaffReports(v)) {
        setData(undefined);
        throw Error("Respuesta incompleta de reportes. Vuelve a intentar.");
      }
      setData(v);
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : "Error de consulta.");
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [applied, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, revision]);
  const report = data?.items.find((r) => r.id === (selected || activeId));
  const involved = Boolean(
    report &&
    (report.reporterId === actorId || report.reportedUserId === actorId),
  );
  const assignedToMe = Boolean(
    report?.assignedToId && report.assignedToId === actorId,
  );
  const ownerException = Boolean(report?.ownerExceptionRequired);
  const canOperate =
    canResolve && assignedToMe && (!involved || ownerException);
  const blocked = Boolean(
    report && ["PENDING", "FAILED"].includes(report.intervention.state),
  );
  const canReview = canOperate && !blocked;
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>(
    {},
  );
  const actReport = (
    payload: Record<string, unknown>,
    context?: ActionContext,
  ) =>
    onAction(payload, {
      ...context,
      ownerExceptionRequired: ownerException,
      reportLabel: report?.subject,
    });
  const reportState = (r: Result["items"][number]) =>
    r.status !== "OPEN"
      ? "Resuelto"
      : r.assignedToId
        ? "En revisión"
        : "Pendiente";
  return (
    <section
      className="staff-report-center"
      data-managed-drafts
      aria-busy={loading}
    >
      <form
        className="staff-report-filters staff-surface"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({
            ...filters,
            assignee:
              filters.assignee === "Sin asignar"
                ? "UNASSIGNED"
                : filters.assignee,
          });
          setPage(1);
          setSelected("");
        }}
      >
        <div className="staff-report-search-line">
          <label className="staff-search-row">
            <Search size={17} />
            <input
              aria-label="Buscar reportes"
              placeholder="Buscar caso, asunto o descripción"
              maxLength={128}
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </label>
          <StaffButton type="submit" variant="primary" loading={loading}>
            <Search size={15} />
            Aplicar filtros
          </StaffButton>
        </div>
        <div className="staff-report-filter-heading">
          <span>
            <SlidersHorizontal size={14} />
            Acotar resultados
          </span>
          <StaffButton
            variant="quiet"
            type="button"
            disabled={
              loading ||
              (!Object.values(filters).some(Boolean) &&
                !Object.values(applied).some(Boolean))
            }
            onClick={() => {
              setFilters({ ...emptyFilters });
              setApplied({ ...emptyFilters });
              setPage(1);
              setSelected("-");
            }}
          >
            <RotateCcw size={13} />
            Limpiar filtros
          </StaffButton>
        </div>
        <div className="staff-report-secondary-filters">
          <label className="staff-field">
            Estado
            <DashboardDropdown
              fullWidth
              className="staff-select"
              label="Estado del reporte"
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status })}
              options={[
                { value: "", label: "Todos los estados" },
                { value: "OPEN", label: "Pendientes y en revisión" },
                { value: "UNASSIGNED", label: "Sin asignar" },
                { value: "ASSIGNED", label: "En revisión" },
                { value: "REVIEWED", label: "Resueltos" },
              ]}
            />
          </label>
          <label className="staff-field">
            Categoría
            <DashboardDropdown
              fullWidth
              className="staff-select"
              label="Categoría del reporte"
              value={filters.category}
              onChange={(category) => setFilters({ ...filters, category })}
              options={[
                { value: "", label: "Todas las categorías" },
                ...(data?.categories ?? []).map((c) => ({
                  value: c,
                  label: categoryLabel(c),
                })),
              ]}
            />
          </label>
          <label className="staff-field">
            Usuario involucrado
            <input
              className="staff-input"
              aria-label="Usuario involucrado"
              placeholder="Nombre, DF-ID o SteamID64"
              maxLength={128}
              value={filters.user}
              onChange={(e) => setFilters({ ...filters, user: e.target.value })}
            />
          </label>
          <label className="staff-field">
            Responsable
            <input
              className="staff-input"
              aria-label="Responsable"
              placeholder="Nombre o Sin asignar"
              maxLength={128}
              value={filters.assignee}
              onChange={(e) =>
                setFilters({ ...filters, assignee: e.target.value })
              }
            />
          </label>
        </div>
        <small>Consulta de todo el historial · 15 casos por página</small>
      </form>
      {error && (
        <div role="alert" className="staff-alert staff-alert--error">
          <p>{error}</p>
          <StaffButton onClick={() => void load()} disabled={loading}>
            Reintentar reportes
          </StaffButton>
        </div>
      )}
      <div className={"staff-report-layout " + (report ? "has-selection" : "")}>
        <div className="staff-report-list">
          {data?.items.map((r) => (
            <button
              key={r.id}
              id={"staff-report-" + r.id}
              className="staff-report-row"
              aria-pressed={report?.id === r.id}
              aria-controls={
                report?.id === r.id ? "staff-case-detail" : undefined
              }
              onClick={() => setSelected(r.id)}
            >
              <span className="staff-report-row-top">
                <span
                  className={
                    "staff-status " +
                    (r.status === "OPEN" ? "" : "staff-status--success")
                  }
                >
                  {reportState(r)}
                </span>
                <span className="staff-report-category">
                  {categoryLabel(r.category)}
                </span>
              </span>
              <span className="staff-report-subject">
                <strong>{r.subject}</strong>
                <ChevronRight size={17} aria-hidden="true" />
              </span>
              <span className="staff-report-identities">
                <StaffIdentity
                  user={r.reportedUser}
                  size={32}
                  detail="Cuenta reportada"
                />
                <StaffIdentity
                  user={r.reporter}
                  size={32}
                  detail="Denunciante"
                />
              </span>
              <span className="staff-report-row-footer">
                <time dateTime={new Date(r.createdAt).toISOString()}>
                  <CalendarClock size={12} />
                  {new Date(r.createdAt).toLocaleDateString("es-CO")}
                </time>
                <span
                  title={
                    r.assignedTo?.displayName ||
                    r.assignedTo?.username ||
                    "Sin asignar"
                  }
                >
                  {r.assignedTo ? (
                    <>
                      {r.status === "OPEN" ? "En revisión por" : "Responsable:"}{" "}
                      {r.assignedTo.displayName || r.assignedTo.username}
                    </>
                  ) : (
                    "Sin asignar"
                  )}
                </span>
              </span>
            </button>
          ))}
          {!loading && data && !data.items.length && (
            <StaffEmpty>
              No hay reportes que coincidan con los filtros.
            </StaffEmpty>
          )}
          {loading && !data && <p role="status">Consultando casos…</p>}
          {data && (
            <StaffPager
              page={page}
              pages={data.pagination.totalPages}
              total={data.pagination.total}
              label="reportes encontrados"
              onPage={setPage}
            />
          )}
        </div>
        {report ? (
          <aside
            id="staff-case-detail"
            className="staff-report-detail staff-surface"
            aria-label="Detalle del reporte"
            key={report.id}
          >
            <div className="staff-section-heading">
              <span className="staff-eyebrow">
                REPORTE · {report.id.slice(-8)}
              </span>
              <StaffButton
                variant="quiet"
                aria-label="Cerrar detalle"
                onClick={() => {
                  const row = document.getElementById(
                    "staff-report-" + report.id,
                  );
                  setSelected("-");
                  row?.focus();
                }}
              >
                <X size={17} />
              </StaffButton>
            </div>
            <div className="staff-case-heading">
              <span
                className={
                  "staff-status " +
                  (report.status === "OPEN" ? "" : "staff-status--success")
                }
              >
                {reportState(report)}
              </span>
              <span>{categoryLabel(report.category)}</span>
            </div>
            <h2>{report.subject}</h2>
            <p className="staff-help">
              <CalendarClock size={12} />
              {new Date(report.createdAt).toLocaleString("es-CO")}
            </p>
            <section className="staff-case-section">
              <h3>Personas involucradas</h3>
              <div className="staff-case-identities">
                <div>
                  <small>Cuenta reportada</small>
                  <StaffIdentity user={report.reportedUser} />
                </div>
                <div>
                  <small>Denunciante</small>
                  <StaffIdentity user={report.reporter} />
                </div>
              </div>
            </section>
            <section className="staff-case-section">
              <h3>
                <FileText size={15} />
                Investigación
              </h3>
              <span className="staff-eyebrow">DECLARACIÓN ORIGINAL</span>
              <p className="staff-original-evidence">{report.description}</p>
              <div className="staff-case-evidence">
                <h4>
                  <Paperclip size={15} />
                  Evidencias adjuntas
                </h4>
                <EvidenceGallery key={report.id} evidence={report.evidence} />
              </div>
            </section>
            <section className="staff-case-section">
              <h3>
                <UserRoundCheck size={15} />
                Gestión del caso
              </h3>
              <p className="staff-help">Responsable de revisión</p>
              {report.assignedTo ? (
                <>
                  <StaffIdentity user={report.assignedTo} size={32} />
                  {report.assignedAt && (
                    <p className="staff-help">
                      Asignado el{" "}
                      {new Date(report.assignedAt).toLocaleString("es-CO")}
                    </p>
                  )}
                </>
              ) : (
                <p className="staff-help">
                  El caso todavía no tiene un responsable asignado.
                </p>
              )}
              {canResolve && report.status === "OPEN" && (
                <div className="staff-case-management-actions">
                  <StaffButton
                    type="button"
                    variant={!report.assignedToId ? "primary" : "secondary"}
                    disabled={
                      busy ||
                      (involved && !ownerException) ||
                      Boolean(report.assignedToId)
                    }
                    onClick={() =>
                      void actReport(
                        {
                          action: "assignReport",
                          reportId: report.id,
                          publicReason: "Caso asignado para investigación",
                        },
                        {
                          target: report.subject,
                          reportedAccount:
                            report.reportedUser.displayName ||
                            report.reportedUser.username,
                          consequence:
                            "Asumirás la revisión de este caso. No se aplicará ninguna sanción.",
                        },
                      )
                    }
                  >
                    {assignedToMe ? "Asignado a ti" : "Asignarme reporte"}
                  </StaffButton>
                </div>
              )}
            </section>
            {report.resolution && (
              <section className="staff-case-section staff-resolution-record">
                <header>
                  <h3>Resolución del caso</h3>
                  <div>
                    {report.reviewedBy && (
                      <StaffIdentity user={report.reviewedBy} size={26} />
                    )}
                    <time>
                      {report.reviewedAt &&
                        new Date(report.reviewedAt).toLocaleString("es-CO")}
                    </time>
                  </div>
                </header>
                <div className="staff-resolution-meta">
                  <span className="staff-status staff-status--success">
                    Resuelto
                  </span>
                  <span>
                    {report.resolutionDecision
                      ? (reportDecisions[
                          report.resolutionDecision as keyof typeof reportDecisions
                        ] ?? "Decisión registrada")
                      : "Sin clasificación histórica"}
                  </span>
                </div>
                <p className="staff-original-evidence">{report.resolution}</p>
              </section>
            )}

            {canResolve && report.status === "OPEN" && (
              <section className="staff-case-section">
                <h3>Decisión del caso</h3>
                <p className="staff-help">
                  Registra tu conclusión. Aplicar una intervención es un paso
                  independiente y requiere confirmación.
                </p>
                {ownerException && (
                  <p className="staff-help">
                    Estás involucrado en este reporte. Las acciones del
                    propietario requieren una confirmación excepcional auditada.
                  </p>
                )}
                {canOperate && report.availableSanctionActions.length > 0 && (
                  <div className="staff-intervention-tools">
                    <InterventionDialog
                      user={report.reportedUser}
                      key={report.id}
                      userId={report.reportedUserId}
                      userName={
                        report.reportedUser.displayName ??
                        report.reportedUser.username
                      }
                      actions={report.availableSanctionActions}
                      busy={busy}
                      onAction={actReport}
                      serverNow={data!.serverNow}
                      moderator={data?.actorRole === "MODERATOR"}
                      reportId={report.id}
                      reportTitle={report.subject}
                      ownerExceptionRequired={ownerException}
                      disabled={blocked}
                    />
                  </div>
                )}
                {canOperate && !report.availableSanctionActions.length && (
                  <p className="staff-help">
                    La jerarquía o tus permisos no permiten sancionar esta
                    cuenta. Puedes investigar y resolver el reporte.
                  </p>
                )}
                {canOperate && blocked && (
                  <form
                    className="staff-intervention-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void actReport(
                        {
                          action: "cancelReportIntervention",
                          reportId: report.id,
                          interventionId: report.intervention.id,
                          publicReason: cancelReasons[report.id],
                        },
                        {
                          target: report.subject,
                          consequence:
                            "Se cancelará el intento pendiente o fallido. No se borrarán sanciones confirmadas ni la auditoría.",
                        },
                      );
                    }}
                  >
                    <p role="status">
                      Hay una intervención{" "}
                      {report.intervention.state === "FAILED"
                        ? "fallida"
                        : "pendiente"}
                      . Reintenta la confirmación original o cancela este
                      intento antes de resolver.
                    </p>
                    <label className="staff-field">
                      Motivo para cancelar el intento
                      <input
                        className="staff-input"
                        aria-label="Motivo para cancelar el intento"
                        required
                        minLength={3}
                        maxLength={500}
                        value={cancelReasons[report.id] ?? ""}
                        onChange={(e) =>
                          setCancelReasons({
                            ...cancelReasons,
                            [report.id]: e.target.value,
                          })
                        }
                      />
                    </label>
                    <StaffButton
                      type="submit"
                      disabled={
                        busy ||
                        (cancelReasons[report.id] ?? "").trim().length < 3
                      }
                    >
                      Cancelar intervención pendiente
                    </StaffButton>
                  </form>
                )}
                <form
                  className="staff-case-resolution"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      !canReview ||
                      (drafts[report.id] ?? "").trim().length < 3
                    )
                      return;
                    void actReport(
                      {
                        action: "resolveReport",
                        reportId: report.id,
                        publicReason: drafts[report.id],
                        decision: decisions[report.id] ?? "OTHER",
                      },
                      {
                        target: report.subject,
                        reportedAccount:
                          report.reportedUser.displayName ||
                          report.reportedUser.username,
                        reviewer:
                          report.assignedTo?.displayName ||
                          report.assignedTo?.username,
                        consequence:
                          "Se cerrará la revisión conservando la declaración y las evidencias originales. No se aplicarán sanciones automáticamente.",
                      },
                    );
                  }}
                >
                  <label className="staff-field">
                    Decisión
                    <DashboardDropdown
                      className="staff-select"
                      fullWidth
                      label="Decisión del caso"
                      disabled={!canReview || busy}
                      value={decisions[report.id] ?? "OTHER"}
                      onChange={(decision) =>
                        setDecisions({ ...decisions, [report.id]: decision })
                      }
                      options={Object.entries(reportDecisions).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </label>
                  <label className="staff-field">
                    Conclusión escrita
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      readOnly={!canOperate}
                      value={drafts[report.id] ?? ""}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [report.id]: e.target.value })
                      }
                      placeholder="Conclusión y motivo obligatorio"
                    />
                  </label>
                  <p className="staff-help">
                    {involved && !ownerException
                      ? "Otro miembro del Staff debe revisar este reporte porque eres una de las personas involucradas."
                      : !report.assignedToId
                        ? "Primero debes asignarte este reporte para poder resolverlo"
                        : assignedToMe
                          ? blocked
                            ? "Completa o cancela la intervención pendiente antes de resolver."
                            : "Asignado a ti. Puedes resolver sin sanción; no es obligatorio aplicar una intervención."
                          : `Este caso está en revisión por ${report.assignedTo?.displayName || report.assignedTo?.username || "otro miembro del Staff"}. Solo su responsable puede resolverlo.`}
                  </p>
                  <div className="staff-form-actions">
                    <StaffButton
                      type="submit"
                      variant="primary"
                      loading={busy}
                      disabled={
                        !canReview ||
                        (drafts[report.id] ?? "").trim().length < 3
                      }
                    >
                      Revisar resolución
                    </StaffButton>
                  </div>
                </form>
              </section>
            )}
            <section className="staff-case-section staff-case-history">
              <h3>Historial del caso</h3>
              <ReportInterventions report={report} />
              {canViewUser && (
                <StaffButton
                  onClick={() => onUser(report.reportedUserId, report.id)}
                >
                  Ver historial del jugador
                </StaffButton>
              )}
            </section>
            <small className="staff-record-id">
              <Flag size={12} />
              {report.id}
            </small>
          </aside>
        ) : (
          <div className="staff-report-prompt">
            <Flag size={30} />
            <h2>Revisa un caso</h2>
            <p>
              {selected && selected !== "-"
                ? "El caso ya no está en estos resultados. Revisa los filtros para volver a consultarlo."
                : "Selecciona un reporte para consultar su contexto y evidencia sin perder el listado."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
