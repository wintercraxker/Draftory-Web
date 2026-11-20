"use client";
import { Trash2, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DashboardButton } from "./DashboardUi";
import { DashboardDialog } from "./DashboardDialog";
import Link from "next/link";
export function AccountDangerZone() {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false);
  const [pending, setPending] = useState(false),
    [resolution, setResolution] = useState("/configuracion?tab=cuenta");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/account/delete", { signal: c.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (!c.signal.aborted) {
          setAvailable(!!v?.available);
          setPending(!!v?.pending);
        }
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  async function erase() {
    if (sending.current || confirmation !== "ELIMINAR" || !available) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const v = await r.json();
      if (v.pending) {
        setPending(true);
        if (
          typeof v.resolution === "string" &&
          [
            "/salas",
            "/partidas",
            "/clan",
            "/reglas",
            "/predicciones",
            "/configuracion?tab=cuenta",
            "/configuracion?tab=dota",
          ].includes(v.resolution)
        )
          setResolution(v.resolution);
      }
      if (!r.ok || v.erased !== true)
        throw new Error(v.error || "No se confirmó la eliminación.");
      window.location.replace("/?account=deleted");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar la cuenta.",
      );
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="settings-danger-zone">
      <p className="dashboard-label">Zona de peligro</p>
      <h2 className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert size={17} className="text-red-300/70" />
        Eliminar cuenta
      </h2>
      <p className="mt-2 text-xs leading-5 text-zinc-400">
        Eliminar tu cuenta retirará tu acceso a Draftory. Algunos registros
        competitivos compartidos pueden conservarse de forma anónima cuando
        corresponda.
      </p>
      {pending && (
        <p role="status" className="settings-help mt-3">
          Tu solicitud está registrada y pendiente de resolución. Conservas el
          acceso; vuelve a confirmar cuando se resuelva el vínculo indicado.
        </p>
      )}
      <DashboardButton
        variant="danger"
        size="sm"
        disabled={!available}
        onClick={() => {
          setConfirmation("");
          setError("");
          setOpen(true);
        }}
        className="account-danger-button mt-4"
      >
        <Trash2 size={14} />
        Eliminar cuenta
      </DashboardButton>
      {!available && (
        <p className="mt-3 text-xs text-zinc-500">
          La eliminación segura requiere activar la migración de cuenta.
        </p>
      )}
      {open && (
        <DashboardDialog
          titleId="account-delete-title"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="dashboard-panel rounded-xl p-6">
            <h2 id="account-delete-title" className="text-lg font-semibold">
              ¿Estás seguro de que quieres eliminar tu cuenta?
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Esta acción no se puede deshacer. Perderás el acceso a tu perfil y
              configuración. Los registros compartidos y de moderación
              necesarios se conservan desvinculados de tu identidad. Tus
              partidas, equipos y los resultados de otros jugadores no se
              borran.
            </p>
            <label className="mt-5 block text-xs">
              Para confirmar, escribe ELIMINAR
              <input
                disabled={busy}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
                autoComplete="off"
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-300">
                {error}
              </p>
            )}
            {pending && (
              <p className="text-xs mt-3">
                <Link className="underline" href={resolution}>
                  Consultar cómo resolverlo
                </Link>
                . Staff puede consultar la solicitud en su auditoría. No se ha
                eliminado tu cuenta.
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <DashboardButton disabled={busy} onClick={() => setOpen(false)}>
                Cancelar
              </DashboardButton>
              <DashboardButton
                variant="danger"
                size="sm"
                disabled={confirmation !== "ELIMINAR" || busy}
                busy={busy}
                onClick={() => void erase()}
                className="account-danger-button"
              >
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </DashboardButton>
            </div>
          </div>
        </DashboardDialog>
      )}
    </section>
  );
}
