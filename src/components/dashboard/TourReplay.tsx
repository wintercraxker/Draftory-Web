"use client";
import { useRef, useState } from "react";
import { Compass } from "lucide-react";
import { DashboardButton } from "./DashboardUi";
export function TourReplay() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sending = useRef(false);
  return (
    <div className="settings-account-row">
      <div>
        <p className="dashboard-label">Descubre Draftory</p>
        <p className="settings-help mt-2">
          Repite el recorrido sin reiniciar tu onboarding ni cambiar tus datos.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
      <DashboardButton
        busy={busy}
        onClick={async () => {
          if (sending.current) return;
          sending.current = true;
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/account/tour", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "IN_PROGRESS",
                step: 0,
                replay: true,
              }),
            });
            const v = await r.json();
            if (!r.ok)
              throw new Error(v.error || "No se pudo iniciar la guía.");
            window.dispatchEvent(new Event("draftory:tour-replay"));
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "No se pudo iniciar la guía.",
            );
          } finally {
            setBusy(false);
            sending.current = false;
          }
        }}
      >
        <Compass size={14} />
        Ver novedades de Draftory · Repetir guía
      </DashboardButton>
    </div>
  );
}
