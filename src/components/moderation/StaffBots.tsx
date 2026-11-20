"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CircleHelp,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Radio,
  Unplug,
  Layers3,
  Activity,
} from "lucide-react";
import {
  botActions,
  botCommandStatuses,
  botResultLabels,
  botEvents,
  type BotAction,
} from "@/lib/bot-console-catalog";
import { StaffConfirmation } from "./StaffConfirmation";
import { DashboardDropdown } from "../dashboard/Dropdown";
import { StaffButton } from "./StaffUi";
import type { staffBots } from "@/lib/real/staff-bots";
type Feed = Awaited<ReturnType<typeof staffBots>>;
const states: Record<string, string> = {
  UNREGISTERED: "Sin registrar",
  OFFLINE: "Desconectado",
  BUSY: "Ocupado",
  DEGRADED: "Capacidad protegida",
  STARTING: "Preparando conexión",
  HEALTHY: "Disponible",
  INTERVENTION_REQUIRED: "Requiere intervención",
};
const connection = (v: boolean | null) =>
  v === null ? "Sin señal reciente" : v ? "Conectado" : "Desconectado";
const activities: Record<string, string> = {
  CREATE_LOBBY: "Creación de lobby",
  INVITE_PLAYERS: "Invitaciones",
  CANCEL_LOBBY: "Cierre de lobby",
};
const time = (value: Date | string | null) =>
  value ? new Date(value).toLocaleString("es-CO") : "Sin observación";
export function StaffBots() {
  const [feed, setFeed] = useState<Feed>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [bot, setBot] = useState(""),
    [severity, setSeverity] = useState(""),
    [category, setCategory] = useState(""),
    [day, setDay] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [pending, setPending] = useState<{
    reference: string;
    action: BotAction;
    requestId: string;
  }>();
  const sequence = useRef(0),
    sending = useRef(false);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreActionFocus = () =>
    requestAnimationFrame(() => actionTrigger.current?.focus());
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const version = ++sequence.current;
      setLoading(true);
      try {
        const r = await fetch(
          "/api/staff/bots?" +
            new URLSearchParams({
              bot,
              severity,
              category,
              date: day,
              q: search,
              page: String(page),
            }),
          { cache: "no-store", signal },
        );
        const d = await r.json();
        if (!r.ok) {
          if (
            (r.status === 401 || r.status === 403) &&
            version === sequence.current
          ) {
            setFeed(undefined);
            setPending(undefined);
          }
          throw Error(d.error || "No se pudo consultar la consola.");
        }
        if (!signal?.aborted && version === sequence.current) {
          setFeed(d);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted && version === sequence.current)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo conectar con la consola.",
          );
      } finally {
        if (version === sequence.current) setLoading(false);
      }
    },
    [bot, severity, category, day, page, search],
  );
  useEffect(() => {
    const c = new AbortController();
    const initial = setTimeout(() => void load(c.signal), 0);
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        await load(c.signal);
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      c.abort();
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function send() {
    if (!pending || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/staff/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending, confirmed: true }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "No se pudo registrar la solicitud.");
      setNotice(
        "Solicitud registrada. Aún no se ha confirmado su ejecución en Windows.",
      );
      setPending(undefined);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al solicitar la acción.",
      );
    } finally {
      setBusy(false);
      sending.current = false;
      restoreActionFocus();
    }
  }
  const categories = [
    ...new Set(Object.values(botEvents).map((e) => e.category)),
  ];
  return (
    <section className="space-y-5 min-w-0" aria-label="Consola de bots Windows">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="dashboard-label">OWNER · CENTRO DE OPERACIONES</p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 flex items-center gap-3">
            <Bot size={27} />
            Bots de Draftory
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-xl">
            Tres identidades independientes. Conexión, capacidad y órdenes
            confirmadas desde Windows.
          </p>
        </div>
        <div className="space-y-2">
          <StaffButton disabled={loading} onClick={() => void load()}>
            <RefreshCw size={15} />
            Actualizar estado
          </StaffButton>
          <p className="text-[11px] text-zinc-500 tabular-nums">
            {feed
              ? "Observado: " + time(feed.serverNow)
              : "Esperando observación"}
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="staff-alert staff-alert--error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="staff-alert">
          {notice}
        </p>
      )}
      {feed && (
        <>
          <div
            className="grid grid-cols-2 xl:grid-cols-4 gap-3"
            aria-label="Resumen de capacidad"
          >
            {[
              {
                title: "Conectados",
                value: feed.bots.filter(
                  (b) => b.steam === true && b.gc === true,
                ).length,
                detail: "Steam y Dota GC confirmados",
                icon: Radio,
              },
              {
                title: "Sin conexión confirmada",
                value: feed.bots.filter(
                  (b) => b.steam !== true || b.gc !== true,
                ).length,
                detail: "Incluye señales vencidas",
                icon: Unplug,
              },
              {
                title: "Ocupados",
                value: feed.bots.filter((b) => b.state === "BUSY").length,
                detail: "Intento o actividad protegida",
                icon: Layers3,
              },
              {
                title: "Disponibles",
                value: feed.competitiveAdmissionEnabled
                  ? feed.bots.filter(
                      (b) =>
                        b.state === "HEALTHY" && !b.idleOnly && !b.draining,
                    ).length
                  : 0,
                detail: "Capacidad competitiva confirmada",
                icon: Activity,
              },
            ].map((s) => (
              <div
                key={s.title}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 min-w-0"
              >
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <s.icon size={15} />
                  {s.title}
                </div>
                <p className="text-3xl font-semibold tabular-nums text-zinc-100 mt-2">
                  {s.value}
                  <span className="text-sm text-zinc-600 font-normal">
                    {" "}
                    / 3
                  </span>
                </p>
                <p className="mt-2 text-[11px] text-zinc-500">{s.detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-xs text-zinc-400">
            <ShieldCheck size={16} className="text-purple-300" />
            <strong className="text-zinc-200">
              {feed.allowedActions.includes("RECOVER")
                ? "Operación competitiva configurada"
                : "Partidas protegidas · diagnóstico"}
            </strong>
            <span>
              Una conexión Steam/GC no equivale a disponibilidad para jugar.
            </span>
          </div>
          {(!feed.schemaReady || !feed.agentActivationEnabled) && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 flex gap-3 text-sm text-zinc-400">
              <ShieldCheck size={18} className="shrink-0 text-violet-300" />
              <p>
                {!feed.schemaReady
                  ? "Historial y órdenes pendientes de la migración de consola. "
                  : "Historial preparado. "}
                El control remoto Windows está desactivado. Ninguna acción de
                esta página inicia bots ni partidas.
              </p>
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            {feed.bots.map((b) => (
              <article
                key={b.reference}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 min-w-0 border-t-2 border-t-purple-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-zinc-100">
                    <span className="rounded-lg bg-violet-400/10 p-2 text-violet-300">
                      <Bot size={21} />
                    </span>
                    Bot {b.reference.slice(-2)}
                  </div>
                  <span
                    className={
                      "text-xs rounded-full border px-2 py-1 " +
                      (b.state === "HEALTHY" && feed.competitiveAdmissionEnabled
                        ? "text-green-300 border-green-800"
                        : "text-zinc-300 border-zinc-700")
                    }
                  >
                    {b.state === "HEALTHY" && !feed.competitiveAdmissionEnabled
                      ? "Conectado · admisión cerrada"
                      : states[b.state] || "Estado no disponible"}
                  </span>
                </div>
                <dl className="mt-4 space-y-2 text-xs">
                  {[
                    ["Supervisor", connection(b.supervisor)],
                    ["Proceso", connection(b.worker)],
                    ["Steam", connection(b.steam)],
                    ["Dota Game Coordinator", connection(b.gc)],
                    [
                      "Modo observado",
                      !b.observedAt
                        ? "Sin observación"
                        : b.idleOnly
                          ? "Último: diagnóstico idle"
                          : "Último: worker",
                    ],
                    [
                      "Lobby / actividad",
                      (b.lobbyReference ? "#" + b.lobbyReference + " · " : "") +
                        (b.lobbyState || "Sin lobby activo") +
                        (b.activity
                          ? " · " + (activities[b.activity] || "Reconciliación")
                          : ""),
                    ],
                    ["Última conexión registrada", time(b.connectedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-zinc-500">{label}</dt>
                      <dd className="break-words text-right">{value}</dd>
                    </div>
                  ))}
                  <div className="border-t border-zinc-800 pt-2">
                    <dt className="text-zinc-500 inline-flex gap-1 items-center">
                      <Clock3 size={12} />
                      Último heartbeat
                    </dt>
                    <dd className="mt-1 tabular-nums">{time(b.heartbeatAt)}</dd>
                  </div>
                </dl>
                <details className="mt-3 text-xs text-zinc-400">
                  <summary className="cursor-pointer py-1">
                    Observaciones técnicas
                  </summary>
                  <p className="mt-2 break-words">
                    Salud: {time(b.observedAt)}. Supervisor:{" "}
                    {time(b.supervisorAt)}.{" "}
                    {b.enabled
                      ? "Registro habilitado."
                      : "Registro no habilitado."}{" "}
                    Una observación antigua no acredita conexión actual.
                  </p>
                </details>
                {feed.canCommand && (
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <label
                      className="text-xs text-zinc-400"
                      htmlFor={"action-" + b.reference}
                    >
                      Acción administrativa
                    </label>
                    <DashboardDropdown
                      id={"action-" + b.reference}
                      className="staff-select mt-1"
                      fullWidth
                      label={
                        "Acción administrativa de Bot " + b.reference.slice(-2)
                      }
                      value=""
                      triggerLabel="Seleccionar acción…"
                      disabled={
                        !feed.schemaReady ||
                        !feed.agentActivationEnabled ||
                        !b.registered ||
                        busy
                      }
                      onChange={(action) => {
                        if (
                          Object.hasOwn(botActions, action) &&
                          feed.allowedActions.includes(action)
                        ) {
                          actionTrigger.current = document.getElementById(
                            "action-" + b.reference,
                          ) as HTMLButtonElement;
                          setPending({
                            reference: b.reference,
                            action: action as BotAction,
                            requestId: crypto.randomUUID(),
                          });
                        }
                      }}
                      options={Object.entries(botActions).map(
                        ([value, label]) => ({
                          value,
                          label,
                          disabled: !feed.allowedActions.includes(value),
                        }),
                      )}
                    />
                    {(!feed.schemaReady ||
                      !feed.agentActivationEnabled ||
                      !b.registered) && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {!b.registered
                          ? "Falta registrar este bot en la base pública."
                          : !feed.schemaReady
                            ? "Falta la migración de la consola."
                            : "El agente remoto Windows requiere activación autorizada."}
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Actualización cada 15 s con la pestaña visible. Sin consultas a
            Steam desde la web.
          </p>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 min-w-0">
            <h3 className="font-semibold flex gap-2 items-center">
              <Terminal size={17} />
              Registro de eventos
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Observaciones reales y recibos del agente. Conservación de 30
              días.
            </p>
            <input
              aria-label="Buscar eventos"
              placeholder="Buscar evento o diagnóstico…"
              maxLength={80}
              className="staff-input w-full mt-4"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
              <DashboardDropdown
                label="Filtrar bot"
                className="staff-select"
                fullWidth
                value={bot}
                onChange={(value) => {
                  setBot(value);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "Todos los bots" },
                  ...feed.bots.map((b) => ({
                    value: b.reference,
                    label: "Bot " + b.reference.slice(-2),
                  })),
                ]}
              />
              <DashboardDropdown
                label="Filtrar severidad"
                className="staff-select"
                fullWidth
                value={severity}
                onChange={(value) => {
                  setSeverity(value);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "Toda severidad" },
                  { value: "INFO", label: "Información" },
                  { value: "WARN", label: "Advertencia" },
                  { value: "ERROR", label: "Error" },
                ]}
              />
              <DashboardDropdown
                label="Filtrar categoría"
                className="staff-select"
                fullWidth
                value={category}
                onChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "Toda categoría" },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
              <input
                aria-label="Fecha de eventos (UTC)"
                title="Fecha UTC"
                type="date"
                className="staff-input min-w-0"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setPage(1);
                }}
              />
              <StaffButton
                onClick={() => {
                  setBot("");
                  setSeverity("");
                  setCategory("");
                  setDay("");
                  setSearch("");
                  setPage(1);
                }}
              >
                Limpiar filtros
              </StaffButton>
            </div>
            {!feed.events.length ? (
              <div className="py-8 text-center text-sm text-zinc-500">
                <CircleHelp className="mx-auto mb-2" size={23} />
                Sin eventos registrados para estos filtros.
                <p className="mt-1 text-xs">
                  No se genera actividad de muestra para rellenar el historial.
                </p>
              </div>
            ) : (
              <ol className="mt-4 divide-y divide-zinc-800">
                {feed.events.map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <time className="text-zinc-500 tabular-nums">
                        {time(e.createdAt)}
                      </time>
                      <span className="text-violet-300">
                        Bot {e.reference.slice(-2)}
                      </span>
                      <span
                        className={
                          e.severity === "ERROR"
                            ? "text-red-300"
                            : e.severity === "WARN"
                              ? "text-amber-300"
                              : "text-zinc-400"
                        }
                      >
                        {e.severity === "ERROR"
                          ? "Error"
                          : e.severity === "WARN"
                            ? "Advertencia"
                            : "Información"}
                      </span>
                    </div>
                    <h4 className="font-medium text-sm mt-1">{e.title}</h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      {e.explanation}
                    </p>
                    <details className="mt-2 text-xs text-zinc-500">
                      <summary className="cursor-pointer">
                        Diagnóstico y siguiente paso
                      </summary>
                      <p className="mt-2">{e.solution}</p>
                      <p className="mt-1 font-mono break-all">
                        Código: {e.code}
                      </p>
                      {Object.entries(e.details).map(([k, v]) => (
                        <p key={k}>
                          {k}: {String(v)}
                        </p>
                      ))}
                    </details>
                  </li>
                ))}
              </ol>
            )}
            <footer className="flex items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                Página {page} · Retención {feed.retentionDays} días
              </span>
              <div className="flex gap-2">
                <StaffButton
                  disabled={page === 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </StaffButton>
                <StaffButton
                  disabled={!feed.hasNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </StaffButton>
              </div>
            </footer>
          </section>
          {!!feed.commands.length && (
            <section className="rounded-xl border border-zinc-800 p-4">
              <h3 className="font-semibold">
                Solicitudes administrativas recientes
              </h3>
              <ol className="mt-3 space-y-2">
                {feed.commands.map((c) => (
                  <li
                    key={c.id}
                    className="text-sm flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      Bot {c.reference.slice(-2)} · {botActions[c.action]}
                    </span>
                    <span className="text-zinc-400">
                      {botCommandStatuses[c.status] || c.status}
                      {c.resultCode
                        ? " · " +
                          (botResultLabels[c.resultCode] ||
                            "Diagnóstico pendiente")
                        : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      {!feed && loading && (
        <p role="status" className="text-zinc-400 py-8">
          Consultando estado real…
        </p>
      )}
      {pending && (
        <StaffConfirmation
          payload={{ action: "botCommand", roomId: pending.reference }}
          context={{
            target: "Bot " + pending.reference.slice(-2),
            consequence:
              botActions[pending.action] +
              ". No se interrumpirá un lobby, lease ni limpieza pendiente. El resultado requiere recibo del agente.",
          }}
          busy={busy}
          error={error}
          onCancel={() => {
            if (!busy) {
              setPending(undefined);
              setError("");
              restoreActionFocus();
            }
          }}
          onConfirm={() => void send()}
        />
      )}
    </section>
  );
}
