"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Clock3, Pencil } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { validateMmr, mmrLabels, type MmrState } from "@/lib/mmr-policy";

type Feed = {
  installed: boolean;
  maximum: number;
  row: null | {
    value: number;
    verified: boolean;
    status: MmrState;
    revision: number;
    verifiedAt: string | null;
  };
};
export function useCompetitiveMmr() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [error, setError] = useState("");
  const version = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++version.current;
    const response = await fetch("/api/account/mmr", {
      cache: "no-store",
      signal,
    });
    const value = await response.json();
    if (signal?.aborted || current !== version.current) return;
    if (!response.ok)
      throw Error(value.error || "No se pudo consultar el MMR.");
    setFeed(value);
    setError("");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const read = () =>
      void load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail?.source !== "mmr-form") read();
    };
    void Promise.resolve().then(read);
    window.addEventListener("draftory:profile-updated", changed);
    window.addEventListener("focus", read);
    return () => {
      controller.abort();
      window.removeEventListener("draftory:profile-updated", changed);
      window.removeEventListener("focus", read);
    };
  }, [load]);
  return {
    feed,
    error,
    load,
    retry: () => void load().catch((problem) => setError(problem.message)),
  };
}
type Model = ReturnType<typeof useCompetitiveMmr>;
export function CompetitiveMmrEditor({ model }: { model: Model }) {
  const { feed, error: readError, load } = model,
    { refresh } = useAuth();
  const id = useId();
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef<{
      requestId: string;
      value: number;
      expectedRevision: number;
    } | null>(null),
    sending = useRef(false);
  if (feed && !feed.installed) return null;
  const row = feed?.row,
    verified = !!row?.verified && row.value > 0,
    needsDeclaration = !row || row.value <= 0;
  let validation = "";
  try {
    validateMmr(value, feed?.maximum);
  } catch (e) {
    validation = (e as Error).message;
  }
  return (
    <section
      data-tour="competitive-mmr"
      className="competitive-mmr-card"
      aria-labelledby={id}
    >
      <header>
        <span className="mmr-status-icon">
          {verified ? <BadgeCheck size={21} /> : <Clock3 size={21} />}
        </span>
        <div>
          <h2 id={id}>{verified ? "MMR verificado" : "MMR de Dota 2"}</h2>
          <p>Tu nivel para equilibrar salas. Independiente del ELO Draftory.</p>
        </div>
      </header>
      {row && (
        <div className="mmr-operational">
          <strong>
            {row.value.toLocaleString("es-CO")} <small>MMR</small>
          </strong>
          <span
            className="mmr-status"
            data-state={verified ? "VERIFIED" : row.status}
          >
            {verified ? "Verificado" : mmrLabels[row.status]}
          </span>
        </div>
      )}
      {verified && row?.status !== "VERIFIED" && (
        <p className="mmr-card-note">
          {row?.status === "REJECTED"
            ? "Tu solicitud no fue aceptada. Conservas el MMR aprobado."
            : row?.status === "NEEDS_UPDATE"
              ? "Staff solicita una actualización. Conservas el MMR aprobado."
              : "Solicitud de actualización en revisión. Conservas el MMR aprobado."}
        </p>
      )}
      {!verified && row && (
        <p className="mmr-card-note">
          {needsDeclaration
            ? "Actualiza tu declaración con un MMR mayor que cero."
            : "Utilizamos tu declaración provisionalmente mientras Staff revisa tu nivel."}
        </p>
      )}
      {row && !editing && !needsDeclaration && (
        <button
          className="mmr-update-link"
          onClick={() => {
            setValue(String(row.value));
            setEditing(true);
            setMessage("");
          }}
        >
          <Pencil size={13} />
          Solicitar actualización
        </button>
      )}
      {(needsDeclaration || editing) && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (sending.current || !feed) return;
            let n: number;
            try {
              n = validateMmr(value, feed.maximum);
            } catch (e) {
              setMessage((e as Error).message);
              return;
            }
            sending.current = true;
            setBusy(true);
            setMessage("");
            const payload =
              pending.current?.value === n &&
              pending.current.expectedRevision === (row?.revision ?? 0)
                ? pending.current
                : {
                    value: n,
                    expectedRevision: row?.revision ?? 0,
                    requestId: crypto.randomUUID(),
                  };
            pending.current = payload;
            try {
              const response = await fetch("/api/account/mmr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const result = await response.json();
              if (!response.ok) {
                if (response.status === 409) {
                  pending.current = null;
                  await load();
                }
                throw Error(result.error || "No se pudo guardar.");
              }
              pending.current = null;
              await load();
              await refresh();
              setEditing(false);
              window.dispatchEvent(
                new CustomEvent("draftory:profile-updated", {
                  detail: { source: "mmr-form" },
                }),
              );
              setMessage(
                "MMR guardado. Tu declaración está pendiente de revisión.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              sending.current = false;
              setBusy(false);
            }
          }}
        >
          <label htmlFor={id + "-input"}>
            {verified ? "Nuevo MMR solicitado" : "MMR actual"}
          </label>
          <div className="mmr-card-controls">
            <div className="mmr-input-wrap">
              <input
                id={id + "-input"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                maxLength={5}
                placeholder="Ej. 4500"
                required
                aria-describedby={id + "-validation"}
              />
              <span aria-hidden="true">MMR</span>
            </div>
            <button
              className="dashboard-primary-button"
              disabled={busy || !feed || !!validation}
            >
              {busy
                ? "Guardando…"
                : row
                  ? "Enviar actualización"
                  : "Guardar mi MMR"}
            </button>
            {row && !needsDeclaration && (
              <button
                type="button"
                className="dashboard-button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
            )}
          </div>
          {value && validation && (
            <p id={id + "-validation"} role="alert">
              {validation}
            </p>
          )}
        </form>
      )}
      {(message || readError) && (
        <p role="status" className="mmr-card-note">
          {message || readError}
        </p>
      )}
      {!feed && readError && (
        <button className="dashboard-button" onClick={model.retry}>
          Reintentar consulta
        </button>
      )}
    </section>
  );
}
export function CompetitiveMmr({ required = false }: { required?: boolean }) {
  const model = useCompetitiveMmr();
  if (required) {
    if (!model.feed?.installed || (model.feed.row && model.feed.row.value > 0))
      return null;
    return (
      <section className="competitive-mmr-card my-4">
        <h2>Completa tu perfil competitivo</h2>
        <p>Introduce tu MMR actual para participar en nuevas salas.</p>
        <Link
          className="dashboard-primary-button inline-flex mt-3"
          href="/configuracion?tab=mmr"
        >
          Completar mi MMR
        </Link>
      </section>
    );
  }
  return <CompetitiveMmrEditor model={model} />;
}
