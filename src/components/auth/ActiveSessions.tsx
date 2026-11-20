"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, ShieldCheck, RefreshCw, LogOut } from "lucide-react";
import { DashboardButton } from "../dashboard/DashboardUi";
import { DashboardDialog } from "../dashboard/DashboardDialog";
import styles from "./ActiveSessions.module.css";
type Session = {
  id: string;
  current: boolean;
  device: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: null;
};
type Feed = {
  sessions: Session[];
  total: number;
  limit: number;
  snapshot: string;
};
export function ActiveSessions({ active }: { active: boolean }) {
  const [feed, setFeed] = useState<Feed>(),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState<{
      action: "others" | "revoke";
      id?: string;
      snapshot?: string;
      name: string;
      current: boolean;
    } | null>(null);
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/account/sessions", {
        cache: "no-store",
        signal,
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error);
      if (!Array.isArray(value.sessions) || typeof value.snapshot !== "string")
        throw Error("Respuesta de sesiones incompleta.");
      if (!signal?.aborted) setFeed(value);
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron consultar las sesiones.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    const timer = setTimeout(() => void load(c.signal), 0);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [active, load]);
  const date = (value: string) => new Date(value).toLocaleString("es-CO");
  async function confirm() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/account/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pending.action === "others"
            ? { action: "others", snapshot: pending.snapshot }
            : { action: "revoke", id: pending.id },
        ),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.error);
      setPending(null);
      if (value.currentRevoked) {
        const logout = document.createElement("form");
        logout.method = "POST";
        logout.action = "/api/auth/logout";
        logout.hidden = true;
        document.body.appendChild(logout);
        logout.submit();
        return;
      }
      setNotice(
        value.removed
          ? `${value.removed} sesión(es) cerrada(s).`
          : "La sesión ya no estaba disponible.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la sesión.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.root} aria-label="Sesiones activas">
      <header>
        <div>
          <h2>
            <ShieldCheck size={18} />
            Sesiones activas {feed && <span>{feed.total}</span>}
          </h2>
          <p>
            Conexiones reales de tu cuenta. Cerrar una sesión revoca su acceso
            en el servidor.
          </p>
        </div>
        <DashboardButton
          aria-label="Actualizar sesiones"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
        </DashboardButton>
      </header>
      <p className={styles.help}>
        No se registraron navegador, ubicación ni última actividad de las
        sesiones anteriores. No se estima esa información.
      </p>
      {loading && !feed && <p role="status">Consultando sesiones…</p>}
      {feed && (
        <>
          <ul>
            {feed.sessions.map((s) => (
              <li key={s.id}>
                <span className={styles.icon}>
                  <Monitor size={19} />
                </span>
                <div className={styles.identity}>
                  <strong>
                    {s.device}{" "}
                    {s.current && (
                      <span className={styles.badge}>Sesión actual</span>
                    )}
                  </strong>
                  <small>Inicio: {date(s.createdAt)}</small>
                  <small>
                    Caduca: {date(s.expiresAt)} · Última actividad no registrada
                  </small>
                </div>
                <DashboardButton
                  disabled={busy}
                  aria-label={
                    s.current
                      ? "Cerrar esta sesión"
                      : "Cerrar sesión del " + date(s.createdAt)
                  }
                  onClick={() =>
                    setPending({
                      action: "revoke",
                      id: s.id,
                      name: s.device + " · " + date(s.createdAt),
                      current: s.current,
                    })
                  }
                >
                  <LogOut size={14} />
                  <span>Cerrar sesión</span>
                </DashboardButton>
              </li>
            ))}
          </ul>
          {feed.total > 50 && (
            <p className={styles.help}>
              Se muestran las 50 sesiones más recientes y la sesión actual. La
              acción conjunta incluye las demás existentes al cargar esta lista.
            </p>
          )}
          <div className={styles.footer}>
            <DashboardButton
              variant="danger"
              disabled={busy || feed.total < 2}
              onClick={() =>
                setPending({
                  action: "others",
                  snapshot: feed.snapshot,
                  name: "Las demás sesiones de tu cuenta",
                  current: false,
                })
              }
            >
              Cerrar las demás sesiones
            </DashboardButton>
            <small>Conserva el acceso de este navegador.</small>
          </div>
        </>
      )}
      {notice && (
        <p
          role="status"
          className="settings-feedback settings-feedback-success"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="settings-feedback settings-feedback-error">
          {error}
        </p>
      )}
      {pending && (
        <DashboardDialog
          titleId="session-confirmation"
          onClose={() => {
            if (!busy) setPending(null);
          }}
          dismissible={!busy}
        >
          <div className={styles.dialog}>
            <ShieldCheck size={24} />
            <h2 id="session-confirmation">
              ¿Cerrar{" "}
              {pending.action === "others"
                ? "las demás sesiones"
                : "esta sesión"}
              ?
            </h2>
            <p>{pending.name}</p>
            <p>
              {pending.current
                ? "Este navegador perderá el acceso y tendrás que iniciar sesión de nuevo."
                : "Los dispositivos afectados tendrán que iniciar sesión con Steam otra vez. No se cierran sesiones nuevas posteriores a esta revisión."}
            </p>
            <div>
              <DashboardButton disabled={busy} onClick={() => setPending(null)}>
                Volver
              </DashboardButton>
              <DashboardButton
                variant="danger"
                busy={busy}
                onClick={() => void confirm()}
              >
                Confirmar cierre
              </DashboardButton>
            </div>
          </div>
        </DashboardDialog>
      )}
    </section>
  );
}
