"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { BadgePopover } from "../dashboard/BadgePopover";
import {
  staffBadgeLabels as labels,
  remainingSanction,
} from "@/lib/moderation-presentation";
type Recognition = {
  role: string;
  sponsor?: boolean;
  suspension: {
    kind: string;
    endsAt: string | null;
    publicSummary: string;
  } | null;
  serverNow: string;
};
export function ProfileRecognition({ userId }: { userId: string }) {
  return <RecognitionContent key={userId} userId={userId} />;
}
function RecognitionContent({ userId }: { userId: string }) {
  const [data, setData] = useState<Recognition | null>(null),
    [clock, setClock] = useState<{ at: number; server: number } | null>(null),
    [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const read = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const r = await fetch(
          `/api/profiles/${encodeURIComponent(userId)}/recognition`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!r.ok) throw Error();
        const v = await r.json();
        if (!controller.signal.aborted) {
          setData(v);
          setClock({ at: performance.now(), server: Date.parse(v.serverNow) });
          setNow(Date.parse(v.serverNow));
        }
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [userId]);
  useEffect(() => {
    if (!clock) return;
    const timer = setInterval(
      () => setNow(clock.server + performance.now() - clock.at),
      1000,
    );
    return () => clearInterval(timer);
  }, [clock]);
  if (!data) return null;
  const end = data.suspension?.endsAt
    ? Date.parse(data.suspension.endsAt)
    : null;
  const active = Boolean(data.suspension && (end === null || end > now));
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-xs font-normal">
      {data.sponsor && <SponsorBadge />}
      {labels[data.role] && <StaffRoleBadge role={data.role} />}
      {active && (
        <BadgePopover
          kind="tooltip"
          label={end === null ? "Suspensión permanente" : "Cuenta suspendida"}
          trigger={
            <Image
              src="/sancionado.png"
              width={24}
              height={24}
              alt=""
              className="size-6 shrink-0 object-contain"
            />
          }
        >
          <CardHeading
            src="/sancionado.png"
            category="Estado de la cuenta"
            title={end === null ? "Suspensión permanente" : "Cuenta suspendida"}
            detail={
              end === null
                ? "Suspensión sin vencimiento"
                : "Suspensión temporal"
            }
          />
          {end !== null && (
            <div className="mt-5 border-t border-zinc-800 pt-4">
              <p className="dashboard-label">Tiempo restante</p>
              <p className="mt-2 text-sm font-medium text-zinc-100">
                {remainingSanction(data.suspension!.endsAt!, now)}
              </p>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-zinc-400">
            <span className="font-medium text-zinc-300">Motivo público: </span>
            {data.suspension!.publicSummary}
          </p>
          {end !== null && (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Finaliza {new Date(end).toLocaleString("es-CO")}.
            </p>
          )}
        </BadgePopover>
      )}
    </span>
  );
}
const descriptions: Record<string, string> = {
  OWNER: "Responsable de la administración y dirección de la plataforma.",
  ADMIN: "Miembro del equipo encargado de la administración y moderación.",
  MODERATOR: "Miembro del equipo encargado de mantener una comunidad segura.",
  HELPER: "Miembro del equipo encargado de orientar y asistir a los usuarios.",
};
/** Role comes from server session/DTO; this component only formats recognition. */
export function StaffRoleBadge({ role }: { role: string }) {
  if (!labels[role]) return null;
  const shared = role === "ADMIN" || role === "MODERATOR";
  const src =
    role === "OWNER"
      ? "/badge_owner.png"
      : role === "HELPER"
        ? "/helper.svg"
        : "/staff_badge.png";
  const title = shared ? "Staff de Draftory" : labels[role];
  return (
    <BadgePopover
      kind="tooltip"
      label={title}
      trigger={
        <span className="inline-flex size-6 items-center justify-center">
          <Image
            src={src}
            width={24}
            height={24}
            alt=""
            className={
              role === "OWNER"
                ? "size-[22px] shrink-0 object-contain"
                : "size-6 shrink-0 object-contain"
            }
          />
        </span>
      }
    >
      <CardHeading
        src={src}
        category="Equipo de Draftory"
        title={title}
        detail={shared ? "STAFF" : role}
      />
      <p className="mt-4 text-xs leading-5 text-zinc-400">
        {shared
          ? "Miembro del equipo encargado de mantener el orden y apoyar a la comunidad"
          : descriptions[role]}
      </p>
    </BadgePopover>
  );
}
export function SponsorBadge({ size = 24 }: { size?: number }) {
  return (
    <BadgePopover
      kind="tooltip"
      label="Patrocinador"
      trigger={
        <Image
          src="/patrocinador_badge.png"
          width={size}
          height={size}
          alt=""
          className="shrink-0 object-contain"
          style={{ width: size, height: size }}
        />
      }
    >
      <CardHeading
        src="/patrocinador_badge.png"
        category="Reconocimiento de Draftory"
        title="Patrocinador"
        detail="APOYO A LA PLATAFORMA"
      />
      <p className="mt-4 text-xs leading-5 text-zinc-400">
        Reconocimiento especial a quienes apoyan el crecimiento y desarrollo de
        Draftory
      </p>
    </BadgePopover>
  );
}
function CardHeading({
  src,
  category,
  title,
  detail,
}: {
  src: string;
  category: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <Image
        src={src}
        width={64}
        height={64}
        alt=""
        className="size-16 shrink-0 object-contain"
      />
      <div className="min-w-0">
        <p className="dashboard-label">{category}</p>
        <p className="mt-2 text-xl font-semibold leading-tight text-zinc-100">
          {title}
        </p>
        <p className="mt-1 text-xs text-zinc-400">{detail}</p>
      </div>
    </div>
  );
}
