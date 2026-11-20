"use client";
import { parseSanctionDuration, durationLabel } from "@/lib/sanction-duration";
export type DurationChoice = {
  mode: "duration" | "date";
  text: string;
  date: string;
  time: string;
};
export const initialDuration: DurationChoice = {
  mode: "duration",
  text: "1d",
  date: "",
  time: "12:00",
};
export function durationPayload(
  value: DurationChoice,
): { durationMinutes: number } | { endsAt: string } | null {
  if (value.mode === "duration") {
    const minutes = parseSanctionDuration(value.text);
    return minutes === null ? null : { durationMinutes: minutes };
  }
  if (!value.date || !value.time) return null;
  const local = value.date + "T" + value.time,
    instant = new Date(local);
  if (!Number.isFinite(instant.getTime())) return null;
  const [y, m, d] = value.date.split("-").map(Number),
    [h, min] = value.time.split(":").map(Number);
  if (
    instant.getFullYear() !== y ||
    instant.getMonth() + 1 !== m ||
    instant.getDate() !== d ||
    instant.getHours() !== h ||
    instant.getMinutes() !== min
  )
    return null;
  return { endsAt: instant.toISOString() };
}
export function SanctionDuration({
  value,
  onChange,
  serverNow,
  maxMinutes = 366 * 1440,
}: {
  value: DurationChoice;
  onChange: (v: DurationChoice) => void;
  serverNow: string;
  maxMinutes?: number;
}) {
  const payload = durationPayload(value),
    now = Date.parse(serverNow),
    end =
      payload &&
      ("durationMinutes" in payload
        ? now + payload.durationMinutes * 60000
        : Date.parse(payload.endsAt));
  const valid = Boolean(end && end > now && (end - now) / 60000 <= maxMinutes);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <fieldset className="staff-duration">
      <legend>¿Cuánto durará la sanción?</legend>
      <div className="staff-form-actions">
        <button
          type="button"
          className={
            "staff-button " +
            (value.mode === "duration"
              ? "staff-button--primary"
              : "staff-button--quiet")
          }
          aria-pressed={value.mode === "duration"}
          onClick={() => onChange({ ...value, mode: "duration" })}
        >
          Duración
        </button>
        <button
          type="button"
          className={
            "staff-button " +
            (value.mode === "date"
              ? "staff-button--primary"
              : "staff-button--quiet")
          }
          aria-pressed={value.mode === "date"}
          onClick={() => onChange({ ...value, mode: "date" })}
        >
          Fecha exacta
        </button>
      </div>
      {value.mode === "duration" ? (
        <>
          <label className="staff-field">
            Días, horas y minutos
            <input
              className="staff-input"
              aria-label="Duración personalizada"
              value={value.text}
              maxLength={32}
              placeholder="7d 4h o 30m"
              onChange={(e) => onChange({ ...value, text: e.target.value })}
            />
          </label>
          <div className="staff-duration-presets">
            {["30m", "2h", "1d", "7d", "14d", "30d"]
              .filter(
                (t) => (parseSanctionDuration(t) ?? Infinity) <= maxMinutes,
              )
              .map((t) => (
                <button
                  type="button"
                  className="staff-button staff-button--quiet"
                  key={t}
                  onClick={() => onChange({ ...value, text: t })}
                >
                  {t}
                </button>
              ))}
          </div>
          <small>
            Enteros en orden: d (días), h (horas), m (minutos). Ejemplo: 7d 4h
            30m.
          </small>
        </>
      ) : (
        <div className="staff-duration-calendar">
          <label className="staff-field">
            Día de finalización
            <input
              className="staff-input"
              type="date"
              aria-label="Día de finalización"
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </label>
          <label className="staff-field">
            Hora y minutos
            <input
              className="staff-input"
              type="time"
              aria-label="Hora de finalización"
              value={value.time}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
            />
          </label>
          <small>Zona horaria de este navegador: {zone}</small>
        </div>
      )}
      <p role="status" className="staff-duration-preview">
        {valid && end ? (
          <>
            Duración: {durationLabel(Math.ceil((end - now) / 60000))}
            <br />
            La sanción finalizará el{" "}
            {new Date(end).toLocaleString("es-CO", {
              dateStyle: "long",
              timeStyle: "short",
            })}
            . Zona horaria: {zone}. El servidor calcula la fecha definitiva al
            aplicar.
          </>
        ) : (
          `Selecciona una duración futura válida (máximo ${durationLabel(maxMinutes)}).`
        )}
      </p>
    </fieldset>
  );
}
