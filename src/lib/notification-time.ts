export function notificationTime(createdAt: string, serverNow: string) {
  const seconds = Math.max(
    0,
    (Date.parse(serverNow) - Date.parse(createdAt)) / 1000,
  );
  if (!Number.isFinite(seconds) || seconds < 60) return "Ahora";
  const days = Math.floor(seconds / 86400),
    hours = Math.floor(seconds / 3600),
    minutes = Math.floor(seconds / 60);
  return new Intl.RelativeTimeFormat("es", { numeric: "auto" }).format(
    -(days || hours || minutes),
    days ? "day" : hours ? "hour" : "minute",
  );
}
