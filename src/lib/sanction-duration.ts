/** Strict duration grammar: ordered integer d/h/m units, e.g. 7d 4h or 30m. */
export function parseSanctionDuration(value: string): number | null {
  const m = /^\s*(?:(\d{1,4})d\s*)?(?:(\d{1,5})h\s*)?(?:(\d{1,6})m\s*)?$/i.exec(
    value,
  );
  if (!m || !m.slice(1).some(Boolean)) return null;
  const minutes =
    Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 366 * 1440
    ? minutes
    : null;
}
export function durationLabel(minutes: number) {
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60;
  return [
    days ? `${days} ${days === 1 ? "día" : "días"}` : "",
    hours ? `${hours} ${hours === 1 ? "hora" : "horas"}` : "",
    mins ? `${mins} ${mins === 1 ? "minuto" : "minutos"}` : "",
  ]
    .filter(Boolean)
    .join(" y ");
}
export function sanctionEnd(
  action: string,
  input: { durationMinutes?: unknown; endsAt?: unknown },
  now: Date,
): Date | null {
  if (action === "ban") return null;
  if (action === "warn") return new Date(now.getTime() + 86400000);
  if (input.durationMinutes !== undefined && input.endsAt !== undefined)
    throw Error("Selecciona duración o fecha, no ambas.");
  let end: Date;
  if (input.durationMinutes !== undefined) {
    const n = input.durationMinutes;
    if (
      typeof n !== "number" ||
      !Number.isSafeInteger(n) ||
      n <= 0 ||
      n > 366 * 1440
    )
      throw Error("Duración inválida: entre 1 minuto y 366 días.");
    end = new Date(now.getTime() + n * 60000);
  } else {
    if (
      typeof input.endsAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        input.endsAt,
      )
    )
      throw Error("Selecciona una fecha y hora válidas con zona horaria.");
    const parts = input.endsAt.slice(0, 16).split(/[-T:]/).map(Number),
      [y, m, d, h, min] = parts;
    if (
      m < 1 ||
      m > 12 ||
      d < 1 ||
      d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
      h > 23 ||
      min > 59
    )
      throw Error("La fecha seleccionada no existe.");
    end = new Date(input.endsAt);
  }
  if (
    !Number.isFinite(end.getTime()) ||
    end <= now ||
    end.getTime() - now.getTime() > 366 * 86400000
  )
    throw Error(
      "Duración inválida: la fecha debe ser futura y no superar 366 días.",
    );
  return end;
}
