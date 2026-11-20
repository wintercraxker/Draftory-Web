"use client";
import Link from "next/link";
import {
  Bell,
  Trophy,
  Star,
  ThumbsUp,
  Gamepad2,
  Check,
  ShieldAlert,
  VolumeX,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import type { NotificationFeed } from "@/lib/real/notifications-repository";
import { notificationTime } from "@/lib/notification-time";
import { EmptyState } from "./DashboardUi";
export function NotificationPopover({
  feed,
  busy,
  error,
  mark,
}: {
  feed: NotificationFeed;
  busy: boolean;
  error: string;
  mark: (id: string | null) => Promise<void>;
}) {
  const icons: Record<string, typeof Bell> = {
    ACHIEVEMENT: Trophy,
    MVP: Star,
    COMMEND: ThumbsUp,
    MATCH_RESULT: Gamepad2,
    SUSPENSION: ShieldAlert,
    MODERATION_WARNING: ShieldAlert,
    MODERATION_MUTE: VolumeX,
    SUSPENSION_REVOKED: ShieldCheck,
    SANCTION_EXPIRED: ShieldCheck,
  };
  return (
    <div
      data-notifications
      className="dashboard-panel absolute right-5 top-[calc(100%+8px)] w-[min(360px,calc(100vw-40px))] p-3 shadow-xl"
      role="region"
      aria-label="Notificaciones recientes"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-2 pb-3">
        <h2 className="text-xs font-semibold">Notificaciones</h2>
        {feed.unreadCount > 0 && (
          <button
            disabled={busy}
            className="dashboard-link-button text-[11px]"
            onClick={() => void mark(null)}
          >
            Marcar todas
          </button>
        )}
      </div>
      {error && (
        <p role="status" className="p-2 text-xs text-zinc-400">
          {error}
        </p>
      )}
      {!feed.items.length ? (
        <EmptyState
          compact
          icon={Bell}
          title="Estás al día."
          description="Las novedades de tu cuenta aparecerán aquí."
        />
      ) : (
        <ul className="max-h-[min(420px,60vh)] overflow-y-auto">
          {feed.items.map((item) => {
            const Icon = icons[item.type] ?? Bell;
            return (
              <li
                key={item.id}
                className={`flex gap-3 rounded-lg p-3 transition hover:bg-zinc-800 ${item.readAt ? "text-zinc-500" : "bg-zinc-900 text-zinc-300"}`}
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    width={32}
                    height={32}
                    alt=""
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                ) : (
                  <Icon
                    size={18}
                    className={`mt-1 shrink-0 ${item.type === "ACHIEVEMENT" ? "text-amber-300" : item.type === "MODERATION_WARNING" || item.type === "MODERATION_MUTE" ? "text-amber-400" : item.type === "SANCTION_EXPIRED" || item.type === "SUSPENSION_REVOKED" ? "text-emerald-400" : "text-zinc-400"}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{item.title}</p>
                  <p className="mt-1 break-words text-xs">{item.description}</p>
                  {item.state && (
                    <p className="mt-1 text-[10px] text-zinc-400">
                      {(
                        {
                          ACTIVE: "Vigente",
                          EXPIRED: "Finalizada",
                          REVOKED: "Revocada",
                        } as Record<string, string>
                      )[item.state] ?? item.state}
                      {item.endsAt
                        ? ` · Hasta ${new Date(item.endsAt).toLocaleString("es-CO")}`
                        : ""}
                    </p>
                  )}
                  <time
                    dateTime={item.createdAt}
                    className="mt-2 block text-[10px] text-zinc-500"
                  >
                    {notificationTime(item.createdAt, feed.serverNow)}
                  </time>
                  {item.href && (
                    <Link
                      href={item.href}
                      onClick={() => void mark(item.id)}
                      className="dashboard-link-button mt-2 text-[11px]"
                    >
                      Ver detalle →
                    </Link>
                  )}
                </div>
                {!item.readAt && (
                  <button
                    disabled={busy}
                    aria-label={`Marcar como leída: ${item.description}`}
                    className="dashboard-link-button self-start p-1"
                    onClick={() => void mark(item.id)}
                  >
                    <Check size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
