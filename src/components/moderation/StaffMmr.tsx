"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { DashboardDialog } from "../dashboard/DashboardDialog";
import {
  Clock3,
  ScanSearch,
  ShieldCheck,
  RefreshCw,
  Search,
  X,
  Check,
  Pencil,
  ArrowUpRight,
} from "lucide-react";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import {
  mmrLabels,
  mmrStates,
  validateMmr,
  type MmrState,
} from "@/lib/mmr-policy";
import {
  mmrDecisionCommand,
  mmrDecisionLabels,
  type MmrDecision,
} from "@/lib/mmr-decision";
type Row = {
  userId: string;
  name: string;
  avatar: string | null;
  publicId: string | null;
  steamId: string | null;
  declared: number;
  approved: number | null;
  status: MmrState;
  revision: number;
  declaredAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  reviewer: string | null;
};
type ReviewEvent = {
  id: string;
  action: string;
  reason: string;
  evidence: string;
  actor: string;
  createdAt: string;
  previous: {
    declared: number;
    approved: number | null;
    status: MmrState;
  } | null;
  result: { declared: number; approved: number | null; status: MmrState };
};
type Feed = {
  installed: boolean;
  target?: string | null;
  viewerId?: string;
  capabilities?: { review: boolean; verify: boolean; rejectOrRevoke?: boolean };
  maximum?: number;
  items: Row[];
  total?: number;
  totals?: { status: MmrState; n: number }[];
  page: number;
  pages: number;
  history?: ReviewEvent[];
  competitive?: {
    id: string;
    mode: string;
    finishedAt: string;
    winningSide: string;
    teamSide: string;
    roomRole: string | null;
  }[];
};
const date = (value: string | null, short = false) =>
  value
    ? new Date(value).toLocaleString("es-CO", {
        dateStyle: "short",
        ...(short ? {} : { timeStyle: "short" }),
        timeZone: "America/Bogota",
      })
    : "Sin revisión";
const number = (value: number) => value.toLocaleString("es-CO");
const metrics = [
  { state: "UNVERIFIED", label: "Pendientes", Icon: Clock3 },
  { state: "UNDER_REVIEW", label: "En revisión", Icon: ScanSearch },
  { state: "VERIFIED", label: "Verificados", Icon: ShieldCheck },
  { state: "NEEDS_UPDATE", label: "Por actualizar", Icon: RefreshCw },
] as const;
export function StaffMmr({
  role,
  canVerify = false,
}: {
  role: string;
  canVerify?: boolean;
}) {
  const [feed, setFeed] = useState<Feed | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("updated_desc"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const [listError, setListError] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [updated, setUpdated] = useState("");
  const [decision, setDecision] = useState<MmrDecision | null>(null),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [conflicted, setConflicted] = useState(false),
    [confirmation, setConfirmation] = useState<{
      payload: Record<string, unknown>;
      name: string;
      previous: number;
      decision: MmrDecision;
    } | null>(null);
  const sending = useRef(false);
  const generation = useRef(0),
    pending = useRef<{ key: string; id: string } | null>(null),
    detail = useRef<HTMLElement | null>(null),
    returnFocus = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    const r = await fetch(
      "/api/staff/mmr?" +
        new URLSearchParams({
          search,
          status,
          sort,
          page: String(page),
          ...(selected ? { userId: selected } : {}),
        }),
      { cache: "no-store" },
    );
    const v = await r.json();
    if (current !== generation.current) return;
    if (!r.ok) throw Error(v.error || "No se pudo consultar la revisión.");
    setFeed({ ...v, target: selected });
    setListError("");
    setUpdated(new Date().toISOString());
  }, [search, status, sort, page, selected]);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    const timer = setTimeout(
      () => void load().catch((e) => setListError(e.message)),
      250,
    );
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [load]);
  const row =
      feed?.target === selected
        ? feed?.items.find((r) => r.userId === selected)
        : undefined,
    selectedId = row?.userId;
  const own = !!row && row.userId === feed?.viewerId,
    decide =
      (feed?.capabilities?.verify ?? canVerify) &&
      ["OWNER", "ADMIN", "MODERATOR"].includes(role),
    review =
      feed?.capabilities?.review ??
      ["OWNER", "ADMIN", "MODERATOR"].includes(role);
  useEffect(() => {
    if (selectedId) {
      detail.current?.scrollIntoView({ block: "start", behavior: "instant" });
      detail.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);
  function resetDecision() {
    setDecision(null);
    setValue("");
    setReason("");
    setConfirmation(null);
    setError("");
    setSuccess("");
    setConflicted(false);
    pending.current = null;
  }
  function close() {
    if (sending.current) return;
    setSelected(null);
    resetDecision();
    requestAnimationFrame(() => returnFocus.current?.focus());
  }
  function choose(next: MmrDecision) {
    if (sending.current || conflicted || decision === next) return;
    setDecision(next);
    setValue("");
    setReason("");
    setConfirmation(null);
    setError("");
    setSuccess("");
    pending.current = null;
  }
  async function refreshDecision() {
    try {
      await load();
      resetDecision();
    } catch (problem) {
      setError((problem as Error).message);
    }
  }
  async function saveDecision(payload: Record<string, unknown>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const key = JSON.stringify(payload);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const response = await fetch("/api/staff/mmr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: pending.current.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          pending.current = null;
          setConflicted(true);
        }
        throw Error(
          response.status === 401
            ? "Tu sesión ha caducado. Inicia sesión de nuevo antes de continuar."
            : result.error || "No se pudo guardar la decisión.",
        );
      }
      pending.current = null;
      setDecision(null);
      setValue("");
      setReason("");
      await load();
      setSuccess(
        "Decisión guardada en la auditoría. El jugador recibirá la actualización.",
      );
      window.dispatchEvent(new Event("draftory:profile-updated"));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setConfirmation(null);
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Verificación de MMR"
      className="staff-mmr staff-mmr-v2"
    >
      <header className="mmr-workspace-heading">
        <div>
          <p className="staff-eyebrow">Revisión competitiva</p>
          <h2>Declaraciones de jugadores</h2>
          <p>Revisa las declaraciones y confirma su nivel competitivo.</p>
        </div>
        <button
          className="staff-button staff-button--secondary"
          onClick={() => void load().catch((e) => setListError(e.message))}
          aria-label="Actualizar declaraciones"
        >
          <RefreshCw size={14} />
          <span>{updated ? "Actualizar" : "Cargando"}</span>
        </button>
      </header>
      <div className="staff-mmr-summary">
        {metrics.map(({ state, label, Icon }) => (
          <button
            key={state}
            data-state={state}
            aria-pressed={status === state}
            onClick={() => {
              setStatus(status === state ? "" : state);
              setPage(1);
              setSelected(null);
            }}
          >
            <Icon size={18} aria-hidden />
            <strong>
              {feed?.totals
                ? (feed.totals.find((t) => t.status === state)?.n ?? 0)
                : "—"}
            </strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="mmr-filterbar">
        <label className="mmr-search">
          <span className="sr-only">Buscar jugador</span>
          <Search size={15} />
          <input
            className="staff-input"
            placeholder="Nombre o DF-ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelected(null);
            }}
          />
        </label>
        <label>
          <span>Estado</span>
          <DashboardDropdown
            className="staff-select"
            fullWidth
            label="Estado"
            value={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
              setSelected(null);
            }}
            options={[
              { value: "", label: "Todos los estados" },
              ...mmrStates.map((state) => ({
                value: state,
                label: mmrLabels[state],
              })),
            ]}
          />
        </label>
        <label>
          <span>Orden</span>
          <DashboardDropdown
            className="staff-select"
            fullWidth
            label="Orden"
            value={sort}
            onChange={(next) => {
              setSort(next);
              setPage(1);
              setSelected(null);
            }}
            options={[
              { value: "updated_desc", label: "M\u00e1s recientes" },
              { value: "oldest", label: "M\u00e1s antiguos" },
              { value: "declared_desc", label: "Mayor declaraci\u00f3n" },
            ]}
          />
        </label>
        <button
          className="staff-button staff-button--secondary"
          onClick={() => {
            setSearch("");
            setStatus("");
            setSort("updated_desc");
            setPage(1);
            setSelected(null);
          }}
        >
          Limpiar filtros
        </button>
      </div>
      {listError && (
        <div className="mmr-feedback" role="alert">
          {listError}{" "}
          <button
            onClick={() => void load().catch((e) => setListError(e.message))}
          >
            Reintentar consulta
          </button>
        </div>
      )}
      {feed && !feed.installed ? (
        <p>MMR pendiente de activar su migración.</p>
      ) : feed?.items.length === 0 ? (
        <div className="mmr-empty">
          <ScanSearch size={24} />
          <h3>No hay declaraciones en este filtro</h3>
          <p>Prueba otro nombre o estado para continuar.</p>
        </div>
      ) : (
        <div className="staff-mmr-table">
          <div className="staff-mmr-columns" aria-hidden>
            <span>Jugador</span>
            <span>MMR operativo</span>
            <span>Declaración</span>
            <span>Estado / actualización</span>
            <span>Acción</span>
          </div>
          <ul>
            {feed?.items.map((r) => (
              <li
                key={r.userId}
                className="staff-mmr-row"
                data-selected={selected === r.userId}
              >
                <div className="mmr-player-cell">
                  <AvatarImage
                    id={r.userId}
                    src={r.avatar ?? undefined}
                    alt=""
                    size={36}
                  />
                  <div>
                    <Link
                      prefetch={false}
                      href={"/profile/" + encodeURIComponent(r.userId)}
                    >
                      {r.name}
                    </Link>
                    <small>
                      {r.publicId} ·{" "}
                      {r.steamId ? "Steam vinculado" : "Sin Steam"}
                      {r.userId === feed.viewerId ? " · Tu perfil" : ""}
                    </small>
                  </div>
                </div>
                <div data-label="MMR operativo">
                  <strong>{number(r.approved ?? r.declared)}</strong>
                  <small>
                    {r.approved !== null ? "Verificado" : "Declarado"}
                  </small>
                </div>
                <div data-label="Declaración">
                  {r.approved !== null && r.approved !== r.declared ? (
                    <>
                      <strong>{number(r.declared)}</strong>
                      <small>Actualización solicitada</small>
                    </>
                  ) : (
                    <span className="mmr-muted">
                      {r.approved !== null ? "Sin cambio" : "Inicial"}
                    </span>
                  )}
                </div>
                <div>
                  <span className="staff-mmr-state" data-state={r.status}>
                    {mmrLabels[r.status]}
                  </span>
                  <time dateTime={r.updatedAt} title={date(r.updatedAt)}>
                    {date(r.updatedAt, true)}
                  </time>
                </div>
                <button
                  className="staff-button staff-button--secondary"
                  onClick={(e) => {
                    if (sending.current) return;
                    returnFocus.current = e.currentTarget;
                    resetDecision();
                    setSelected(r.userId);
                  }}
                >
                  {r.userId === feed.viewerId ? "Consultar" : "Revisar"}
                  <ArrowUpRight size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {feed && (
        <footer className="mmr-pagination">
          <span>
            {feed.total ?? feed.items.length} declaraciones
            {updated && (
              <>
                {" "}
                ·{" "}
                <time dateTime={updated}>
                  Actualizado{" "}
                  {new Date(updated).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Bogota",
                  })}
                </time>
              </>
            )}
          </span>
          <div>
            <button
              className="staff-button staff-button--secondary"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1);
                setSelected(null);
              }}
            >
              Anterior
            </button>
            <span>
              {page} / {feed.pages}
            </span>
            <button
              className="staff-button staff-button--secondary"
              disabled={page >= feed.pages}
              onClick={() => {
                setPage((p) => p + 1);
                setSelected(null);
              }}
            >
              Siguiente
            </button>
          </div>
        </footer>
      )}
      {row && (
        <section
          ref={detail}
          tabIndex={-1}
          aria-label="Detalle de revisión MMR"
          className="staff-mmr-detail"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <header>
            <div className="mmr-player-cell">
              <AvatarImage
                id={row.userId}
                src={row.avatar ?? undefined}
                alt=""
                size={44}
              />
              <div>
                <h3>{row.name}</h3>
                <small>
                  {row.publicId} ·{" "}
                  {row.steamId ? "Steam vinculado" : "Sin Steam"}
                </small>
              </div>
            </div>
            <button
              className="staff-button staff-button--secondary"
              onClick={close}
              aria-label="Cerrar revisión"
            >
              <X size={16} />
            </button>
          </header>
          <div className="mmr-review-grid">
            <div className="mmr-review-context">
              <div className="mmr-value-block">
                <span>MMR operativo</span>
                <strong>
                  {number(row.approved ?? row.declared)} <small>MMR</small>
                </strong>
                <span className="staff-mmr-state" data-state={row.status}>
                  {mmrLabels[row.status]}
                </span>
                {row.approved !== null && row.approved !== row.declared && (
                  <p>
                    Solicitado: <b>{number(row.declared)}</b>
                  </p>
                )}
                <p>
                  Revisión: {date(row.verifiedAt)}
                  {row.reviewer ? " · " + row.reviewer : ""}
                </p>
                <Link
                  prefetch={false}
                  href={"/profile/" + encodeURIComponent(row.userId)}
                >
                  Abrir perfil completo <ArrowUpRight size={13} />
                </Link>
              </div>
              <details className="mmr-context-section">
                <summary>
                  Historial y evidencia{" "}
                  <span>{feed?.history?.length ?? 0}</span>
                </summary>
                {feed?.history?.map((ev) => (
                  <article key={ev.id}>
                    <strong>
                      {ev.actor} · {ev.action}
                    </strong>
                    <time dateTime={ev.createdAt}>{date(ev.createdAt)}</time>
                    <p>
                      {ev.previous?.approved ?? ev.previous?.declared ?? "—"} →{" "}
                      {ev.result.approved ?? ev.result.declared} MMR ·{" "}
                      {mmrLabels[ev.result.status]}
                    </p>
                    <p>{ev.reason}</p>
                    {ev.evidence && (
                      <p className="mmr-private-note">{ev.evidence}</p>
                    )}
                  </article>
                ))}
              </details>
              <details className="mmr-context-section">
                <summary>
                  Contexto competitivo{" "}
                  <span>{feed?.competitive?.length ?? 0}</span>
                </summary>
                <p>
                  El rendimiento aporta contexto; no demuestra un MMR exacto.
                </p>
                {feed?.competitive?.length ? (
                  <ul>
                    {feed.competitive.map((m) => (
                      <li key={m.id}>
                        <Link href={"/partidas/" + encodeURIComponent(m.id)}>
                          {m.mode}
                        </Link>
                        <span>
                          {m.winningSide === m.teamSide
                            ? "Victoria"
                            : "Derrota"}{" "}
                          · {m.teamSide}
                          {m.roomRole ? " · " + m.roomRole : ""}
                        </span>
                        <time dateTime={m.finishedAt}>
                          {date(m.finishedAt, true)}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Sin partidas 5v5 verificadas recientes.</p>
                )}
              </details>
            </div>
            <div className="mmr-review-decision">
              <h4>Decisión Staff</h4>
              <p>
                Justifica tu decisión. El servidor comprobará tus permisos y
                conservará la auditoría.
              </p>
              {own ? (
                <div className="mmr-self-notice" role="note">
                  <ShieldCheck size={20} />
                  <strong>Tu declaración requiere otra revisión</strong>
                  <p>
                    No puedes revisar ni verificar tu propio MMR. Pide a otro
                    miembro autorizado de Staff que lo revise.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (sending.current || conflicted || !decision) return;
                    setError("");
                    try {
                      const action = mmrDecisionCommand(decision);
                      const payload = {
                        action,
                        userId: row.userId,
                        expectedRevision: row.revision,
                        reason,
                        ...(action === "approve"
                          ? {
                              value: validateMmr(
                                decision === "correct" ? value : row.declared,
                                feed?.maximum,
                              ),
                            }
                          : {}),
                      };
                      if (!reason.trim())
                        throw Error("Indica el motivo de la decisión.");
                      setConfirmation({
                        payload,
                        name: row.name,
                        previous: row.approved ?? row.declared,
                        decision,
                      });
                    } catch (problem) {
                      setError((problem as Error).message);
                    }
                  }}
                >
                  <div
                    className="mmr-primary-actions"
                    aria-label="Elegir decisión de MMR"
                  >
                    {decide && (
                      <>
                        <button
                          type="button"
                          disabled={busy || conflicted}
                          aria-pressed={decision === "approve"}
                          className={
                            "staff-button " +
                            (decision === "approve"
                              ? "staff-button--primary"
                              : "staff-button--secondary")
                          }
                          onClick={() => choose("approve")}
                        >
                          <Check size={14} aria-hidden />
                          Aprobar MMR
                        </button>
                        <button
                          type="button"
                          disabled={busy || conflicted}
                          aria-pressed={decision === "correct"}
                          className={
                            "staff-button " +
                            (decision === "correct"
                              ? "staff-button--primary"
                              : "staff-button--secondary")
                          }
                          onClick={() => choose("correct")}
                        >
                          <Pencil size={13} aria-hidden />
                          Corregir valor
                        </button>
                      </>
                    )}
                    <DashboardDropdown
                      label="Otras acciones de MMR"
                      className={
                        "mmr-other-actions " +
                        (decision && !["approve", "correct"].includes(decision)
                          ? "is-selected"
                          : "")
                      }
                      disabled={busy || conflicted}
                      value={
                        decision && !["approve", "correct"].includes(decision)
                          ? decision
                          : ""
                      }
                      onChange={(next) => choose(next as MmrDecision)}
                      options={[
                        ...(review
                          ? [
                              { value: "review", label: "Iniciar revisión" },
                              {
                                value: "update",
                                label: "Solicitar actualización",
                              },
                            ]
                          : []),
                        ...(decide &&
                        (feed?.capabilities?.rejectOrRevoke ??
                          ["OWNER", "ADMIN"].includes(role))
                          ? [
                              {
                                value: "reject",
                                label: "Rechazar declaración",
                              },
                              ...(row.approved !== null
                                ? [
                                    {
                                      value: "revoke",
                                      label: "Revocar verificación",
                                    },
                                  ]
                                : []),
                            ]
                          : []),
                        { value: "note", label: "Registrar observación" },
                      ]}
                      triggerLabel="Otras acciones"
                    />
                  </div>
                  {decision ? (
                    <fieldset
                      className="mmr-decision-fields"
                      disabled={busy || conflicted}
                      data-decision={decision}
                    >
                      <legend aria-live="polite">
                        {mmrDecisionLabels[decision].title}
                      </legend>
                      {decision === "approve" ? (
                        <div className="mmr-approval-preview">
                          <span>MMR declarado que se aprobará</span>
                          <strong>
                            {number(row.declared)} <small>MMR</small>
                          </strong>
                        </div>
                      ) : decision === "correct" ? (
                        <label>
                          Nuevo MMR
                          <input
                            className="staff-input"
                            type="text"
                            value={value}
                            inputMode="numeric"
                            pattern="[0-9]+"
                            required
                            maxLength={5}
                            onChange={(event) => {
                              if (/^[0-9]*$/.test(event.target.value))
                                setValue(event.target.value);
                            }}
                            onPaste={(event) => {
                              if (
                                !/^[0-9]+$/.test(
                                  event.clipboardData.getData("text"),
                                )
                              ) {
                                event.preventDefault();
                                setError(
                                  "El MMR solo admite dígitos del 0 al 9, sin espacios ni símbolos.",
                                );
                              }
                            }}
                          />
                          <small>
                            Solo dígitos. Entre 1 y{" "}
                            {number(feed?.maximum ?? 20000)}. MMR anterior:{" "}
                            {number(row.approved ?? row.declared)}.
                          </small>
                        </label>
                      ) : (
                        <p className="mmr-decision-target">
                          Jugador: <strong>{row.name}</strong>
                          {decision === "revoke" && (
                            <> · MMR verificado: {number(row.approved!)}</>
                          )}
                        </p>
                      )}
                      <label>
                        Motivo
                        <textarea
                          className="staff-input"
                          rows={3}
                          value={reason}
                          maxLength={1000}
                          required
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                    </fieldset>
                  ) : (
                    <p className="mmr-decision-hint">
                      Elige la decisión que quieres registrar para este jugador.
                    </p>
                  )}
                  {error && (
                    <div className="mmr-feedback" role="alert">
                      {error}
                    </div>
                  )}
                  {conflicted ? (
                    <button
                      type="button"
                      className="staff-button staff-button--primary"
                      onClick={() => void refreshDecision()}
                    >
                      <RefreshCw size={14} />
                      Actualizar ficha antes de continuar
                    </button>
                  ) : (
                    decision && (
                      <div className="mmr-decision-footer">
                        <button
                          type="button"
                          className="staff-button staff-button--secondary"
                          disabled={busy}
                          onClick={resetDecision}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="staff-button staff-button--primary"
                          disabled={busy || !reason.trim()}
                        >
                          {busy
                            ? "Guardando…"
                            : mmrDecisionLabels[decision].submit}
                        </button>
                      </div>
                    )
                  )}
                </form>
              )}
              {success && (
                <p className="mmr-success" role="status">
                  <Check size={15} />
                  {success}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {confirmation && (
        <DashboardDialog
          titleId="mmr-confirm-title"
          dismissible={!busy}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <div className="mmr-confirm-dialog">
            <h2 id="mmr-confirm-title">
              {mmrDecisionLabels[confirmation.decision].submit}
            </h2>
            <p>
              {mmrDecisionLabels[confirmation.decision].title} para{" "}
              <strong>{confirmation.name}</strong>.
            </p>
            {confirmation.payload.action === "approve" ? (
              <div className="mmr-confirm-change">
                <span>Anterior: {number(confirmation.previous)}</span>
                <ArrowUpRight size={16} />
                <strong>
                  {confirmation.decision === "correct" ? "Nuevo" : "Aprobar"}:{" "}
                  {number(Number(confirmation.payload.value))} MMR
                </strong>
              </div>
            ) : (
              <p>
                MMR operativo anterior:{" "}
                <strong>{number(confirmation.previous)}</strong>
                {confirmation.decision === "revoke" &&
                  " · Se retirará la verificación."}
              </p>
            )}
            <p className="mmr-confirm-reason">
              {String(confirmation.payload.reason)}
            </p>
            <div>
              <button
                type="button"
                className="staff-button staff-button--secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="staff-button staff-button--primary"
                disabled={busy}
                onClick={() => void saveDecision(confirmation.payload)}
              >
                {busy
                  ? "Guardando…"
                  : mmrDecisionLabels[confirmation.decision].submit}
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}
    </section>
  );
}
