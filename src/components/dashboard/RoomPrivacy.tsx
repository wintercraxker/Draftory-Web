"use client";
import { useId, useState } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Unlock,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { DashboardButton } from "./DashboardUi";
import s from "./RoomPrivacy.module.css";
export function RoomPrivacy({
  isPrivate,
  onSave,
  disabled = false,
}: {
  isPrivate: boolean;
  onSave: (privateRoom: boolean, password?: string) => Promise<void>;
  disabled?: boolean;
}) {
  const id = useId(),
    [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false);
  const locked = busy || disabled;
  function reset() {
    setMode("idle");
    setPassword("");
    setConfirmation("");
    setVisible(false);
    setNotice("");
    setError(false);
  }
  async function save(protectedRoom: boolean) {
    if (locked) return;
    setNotice("");
    setError(false);
    if (
      protectedRoom &&
      (password.length < 4 ||
        password.length > 64 ||
        !password.trim() ||
        /[\u0000-\u001f\u007f]/.test(password) ||
        password !== confirmation)
    ) {
      setError(true);
      setNotice(
        password !== confirmation
          ? "Las contraseñas no coinciden."
          : "Usa de 4 a 64 caracteres, sin caracteres de control.",
      );
      return;
    }
    setBusy(true);
    try {
      await onSave(protectedRoom, protectedRoom ? password : undefined);
      reset();
      setNotice(
        protectedRoom
          ? "Protección guardada. Los jugadores actuales permanecen en la sala."
          : "Protección retirada. La sala vuelve a ser pública.",
      );
    } catch (e) {
      setError(true);
      setNotice(
        e instanceof Error
          ? e.message
          : "No se pudo guardar la privacidad. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={s.root}
      data-room-privacy
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "edit") void save(true);
      }}
      aria-busy={busy}
    >
      <header className={s.heading}>
        <span className={s.icon}>
          {isPrivate ? <LockKeyhole size={20} /> : <Unlock size={20} />}
        </span>
        <div>
          <h3>Privacidad y acceso</h3>
          <span className={s.status} data-protected={isPrivate}>
            {isPrivate ? "Sala protegida" : "Sala pública"}
          </span>
        </div>
      </header>
      <p className={s.description}>
        {isPrivate
          ? "Los nuevos jugadores necesitan una contraseña para entrar. Tus miembros actuales conservan su acceso."
          : "Cualquier jugador autorizado puede entrar sin contraseña. Puedes proteger el acceso sin recrear la sala."}
      </p>
      {mode === "idle" && (
        <div className={s.actions}>
          <DashboardButton
            disabled={locked}
            onClick={() => {
              reset();
              setMode("edit");
            }}
          >
            <ShieldCheck size={14} />
            {isPrivate ? "Cambiar contraseña" : "Activar protección"}
          </DashboardButton>
          {isPrivate && (
            <DashboardButton
              variant="ghost"
              disabled={locked}
              onClick={() => {
                reset();
                setMode("remove");
              }}
            >
              Quitar protección
            </DashboardButton>
          )}
        </div>
      )}
      {mode === "edit" && (
        <fieldset disabled={locked} className={s.fields}>
          <label htmlFor={id + "-password"}>
            {isPrivate ? "Nueva contraseña" : "Contraseña de acceso"}
          </label>
          <div className={s.inputRow}>
            <input
              id={id + "-password"}
              name="newRoomPassword"
              autoFocus
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              minLength={4}
              maxLength={64}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={id + "-rules " + id + "-notice"}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={visible}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p id={id + "-rules"} className={s.help}>
            De 4 a 64 caracteres, sin caracteres de control. No se muestra la
            contraseña actual.
          </p>
          <label htmlFor={id + "-confirmation"}>
            Confirmar nueva contraseña
          </label>
          <input
            id={id + "-confirmation"}
            name="confirmRoomPassword"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            required
            maxLength={64}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <div className={s.actions}>
            <DashboardButton type="submit" disabled={locked}>
              {busy && (
                <LoaderCircle
                  size={14}
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {busy
                ? "Guardando…"
                : isPrivate
                  ? "Guardar nueva contraseña"
                  : "Guardar protección"}
            </DashboardButton>
            <DashboardButton variant="ghost" disabled={locked} onClick={reset}>
              Cancelar
            </DashboardButton>
          </div>
        </fieldset>
      )}
      {mode === "remove" && (
        <div className={s.confirmation}>
          <strong>¿Quitar la protección de la sala?</strong>
          <p>
            Los nuevos jugadores podrán entrar sin contraseña. Los miembros,
            equipos y mensajes se conservarán.
          </p>
          <div className={s.actions}>
            <DashboardButton disabled={locked} onClick={() => void save(false)}>
              {busy ? "Guardando…" : "Confirmar: quitar protección"}
            </DashboardButton>
            <DashboardButton variant="ghost" disabled={locked} onClick={reset}>
              Cancelar
            </DashboardButton>
          </div>
        </div>
      )}
      {disabled && (
        <p className={s.help}>
          La privacidad no se puede editar en el estado actual de la sala.
        </p>
      )}
      <p
        id={id + "-notice"}
        role={error ? "alert" : "status"}
        className={s.feedback}
        data-error={error}
      >
        {notice ||
          "Este cambio no modifica equipos, chat ni el estado de la partida."}
      </p>
    </form>
  );
}
