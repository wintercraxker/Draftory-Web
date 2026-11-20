import "server-only";
import {
  reportCategoryInfo,
  type reportCategories,
} from "../moderation-config";
export type StaffReportMessage = {
  id: string;
  reportedName: string;
  draftoryId: string;
  reporterName: string;
  category: string;
  subject: string;
  description: string;
  createdAt: string;
  status?: string;
  imageCount?: number;
};
function safe(value: string, max: number) {
  return value
    .replace(/@/g, "＠")
    .replace(/[<>\u0000-\u001f]/g, " ")
    .slice(0, max);
}
export function staffReportEmbed(
  report: StaffReportMessage,
  origin = process.env.APP_URL,
) {
  let panel: string | undefined;
  try {
    const u = new URL(origin ?? "");
    if (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !/^(localhost|127\.|\[|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        u.hostname,
      ) &&
      u.hostname.includes(".")
    )
      panel = new URL("/staff?report=" + encodeURIComponent(report.id), u).href;
  } catch {}
  const summary = safe(report.description, 1000);
  const created = Date.parse(report.createdAt);
  const shortId =
    "#" + safe(report.id.replace(/^report_/, ""), 8).toUpperCase();
  return {
    title: "Nuevo reporte de jugador",
    color: 0x8b5cf6,
    ...(panel ? { url: panel } : {}),
    ...(Number.isFinite(created)
      ? { timestamp: new Date(created).toISOString() }
      : {}),
    fields: [
      { name: "Caso", value: shortId, inline: true },
      {
        name: "Categoría",
        value:
          reportCategoryInfo[
            report.category as (typeof reportCategories)[number]
          ]?.label ?? "Otro",
        inline: true,
      },
      {
        name: "Estado",
        value: report.status === "REVIEWED" ? "Resuelto" : "Pendiente",
        inline: true,
      },
      {
        name: "Jugador reportado",
        value: safe(report.reportedName, 200) || "Jugador",
        inline: true,
      },
      {
        name: "DF-ID",
        value: safe(report.draftoryId, 64) || "No disponible",
        inline: true,
      },
      {
        name: "Creado",
        value: Number.isFinite(created)
          ? `<t:${Math.floor(created / 1000)}:f>`
          : "No disponible",
        inline: true,
      },
      {
        name: "Asunto",
        value: safe(report.subject, 120) || "Reporte de jugador",
      },
      {
        name: "Descripción",
        value:
          (report.description.length > 1000
            ? summary.slice(0, 999) + "…"
            : summary) || "Sin descripción",
      },
      ...(report.imageCount
        ? [
            {
              name: "Capturas privadas",
              value: `${report.imageCount} imagen(es) · Consulta autorizada en Staff`,
            },
          ]
        : []),
      ...(process.env.DISCORD_STAFF_INCLUDE_REPORTER === "true"
        ? [
            {
              name: "Denunciante",
              value: safe(report.reporterName, 200) || "Jugador",
            },
          ]
        : []),
    ],
    footer: {
      text:
        "ID completo: " +
        safe(report.id, 128) +
        " · Contenido completo en Staff",
    },
  };
}
export function staffReportPayload(
  report: StaffReportMessage,
  origin = process.env.APP_URL,
) {
  const embed = staffReportEmbed(report, origin);
  return {
    embeds: [embed],
    allowed_mentions: { parse: [] },
    ...(embed.url
      ? {
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "Revisar en Staff",
                  url: embed.url,
                },
              ],
            },
          ],
        }
      : {}),
  };
}

let retryAfter = 0;
export async function notifyStaff(
  report: StaffReportMessage,
  fetcher: typeof fetch = fetch,
): Promise<"SENT" | "FAILED" | "NOT_CONFIGURED" | "RETRY"> {
  const raw = process.env.DISCORD_STAFF_WEBHOOK_URL;
  if (!raw) return "NOT_CONFIGURED";
  if (Date.now() < retryAfter) return "RETRY";
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(url.hostname) ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.port
    )
      return "FAILED";
    url.searchParams.set("wait", "true");
    const payload = staffReportPayload(report);
    if ("components" in payload)
      url.searchParams.set("with_components", "true");
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 429) {
      const body = await response.json().catch(() => null);
      const seconds = Math.max(
        Number(response.headers.get("retry-after")) || 0,
        Number(body?.retry_after) || 0,
      );
      retryAfter =
        Date.now() +
        Math.max(30, Number.isFinite(seconds) ? seconds : 30) * 1000;
      return "RETRY";
    }
    if (!response.ok) return "FAILED";
    const message = await response.json().catch(() => null);
    return typeof message?.id === "string" && /^\d+$/.test(message.id)
      ? "SENT"
      : "FAILED";
  } catch {
    return "FAILED";
  } // Saved ticket survives; no blind retry of an ambiguous send.
}
