"use client";
import { PlayerDisplayName } from "@/components/players/PlayerDisplayName";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FaDiscord, FaUsers } from "react-icons/fa6";

import { AvatarImage } from "@/components/dashboard/AvatarIdentity";
import {
  publicTeamRoles,
  communitySupervisor,
  type PublicTeam,
  type PublicTeamMember,
  type PublicSponsorMember,
  type PublicTeamRole,
} from "@/lib/public-team";
import styles from "./Team.module.css";

const sections = [
  { id: "owner", label: "Owner" },
  { id: "sponsor", label: "Patrocinador" },
  { id: "supervisor", label: "Supervisor" },
  { id: "staff", label: "Staff" },
  { id: "helpers", label: "Helpers" },
];

function RankIcon({
  rank,
  className = "size-5",
}: {
  rank: string;
  className?: string;
}) {
  return (
    <Image
      src={`/${rank}.svg`}
      alt=""
      width={20}
      height={20}
      unoptimized
      className={`shrink-0 ${rank === "staff" ? styles.staffIcon : rank === "patrocinador" ? styles.sponsorIcon : ""} ${className}`}
    />
  );
}

function PublicAvatar({
  name,
  avatar,
  owner = false,
  playerId,
}: {
  name: string;
  avatar: string | null;
  owner?: boolean;
  playerId?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      data-player-hover={playerId ? `id:${playerId}` : undefined}
      className={styles.avatar}
      onErrorCapture={() => setFailed(true)}
    >
      {avatar && !failed ? (
        <AvatarImage src={avatar} size={owner ? 92 : 58} alt={name} />
      ) : (
        <span aria-label={"Avatar no disponible: " + name}>
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
function RankBadge({ role, rank }: { role: string; rank: string }) {
  return (
    <span
      className={`${styles.badge} ${rank === "helper" ? styles.helper : rank === "supervisor" ? styles.community : ""}`}
    >
      <RankIcon rank={rank} className="size-3" />
      {role}
    </span>
  );
}
function MemberCard({
  member,
  community = false,
}: {
  member: PublicTeamMember | PublicSponsorMember | typeof communitySupervisor;
  community?: boolean;
}) {
  const definition = community
    ? communitySupervisor
    : member.role === "SPONSOR"
      ? {
          label: "Patrocinador",
          rank: "patrocinador",
          description: "Apoya el crecimiento y desarrollo de Draftory.",
        }
      : publicTeamRoles[member.role as PublicTeamRole];
  const real = "avatar" in member ? member : null;
  const owner = member.role === "OWNER";
  return (
    <article
      data-team-member={member.role}
      className={`${styles.card} ${owner ? styles.owner : ""}`}
    >
      <div className={styles.identity}>
        <PublicAvatar
          key={real?.avatar ?? "empty"}
          name={member.name}
          avatar={real?.avatar ?? null}
          playerId={real?.playerId}
          owner={owner}
        />
        <div className={styles.content}>
          <div className={styles.nameRow}>
            <h3 className={styles.name}>
              <PlayerDisplayName id={real?.playerId} name={member.name} />
            </h3>
            <RankBadge
              role={"label" in definition ? definition.label : definition.role}
              rank={definition.rank}
            />
          </div>
          <p className={styles.description}>{definition.description}</p>
        </div>
      </div>
    </article>
  );
}
function TeamLoading() {
  return (
    <div
      role="status"
      aria-label="Consultando equipo"
      className={styles.skeleton}
    />
  );
}
export default function TeamPage() {
  const [activeSection, setActiveSection] = useState("owner");
  const [feed, setFeed] = useState<PublicTeam>(),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      version = 0;
    const controllers = new Set<AbortController>();
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const current = ++version;
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/public/team", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const value = await response.json();
        if (!Array.isArray(value.staff) || !Object.hasOwn(value, "owner"))
          throw Error();
        if (active && current === version) {
          setFeed(value);
          setError("");
        }
      } catch {
        if (active && current === version) {
          setFeed(undefined);
          setError("No se pudo actualizar el equipo. Inténtalo de nuevo.");
        }
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      controllers.forEach((c) => c.abort());
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [revision]);

  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 36 });

  useEffect(() => {
    const targets = sections
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      // Read every section together, in either scroll direction. The reading line
      // matches the anchor offset; at the bottom the final visible section wins.
      const readingLine = Math.min(160, window.innerHeight * 0.25);
      const bounds = targets.map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }));
      let current = bounds[0];
      for (const target of bounds) {
        if (target.rect.top <= readingLine) current = target;
      }
      if (
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
      ) {
        current =
          bounds
            .filter(
              ({ rect }) => rect.top < window.innerHeight && rect.bottom > 0,
            )
            .at(-1) ?? current;
      }
      if (current) setActiveSection(current.element.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resizeObserver = new ResizeObserver(schedule);
    targets.forEach((target) => resizeObserver.observe(target));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const link = nav.querySelector<HTMLElement>(`[href="#${activeSection}"]`);
      if (link)
        setIndicator({ top: link.offsetTop, height: link.offsetHeight });
    };
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    update();
    return () => observer.disconnect();
  }, [activeSection]);

  return (
    <div
      className={`${styles.team} team-page min-h-[calc(100vh-5rem)] bg-[#09090b] text-zinc-100`}
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-12">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-6 text-sm">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-400 transition hover:text-white"
            >
              <FaDiscord className="text-violet-300" /> draftory.lol
            </Link>
            <nav
              ref={navRef}
              aria-label="Secciones del equipo"
              className="team-nav space-y-1 border-l border-zinc-800 pl-4"
            >
              <span
                aria-hidden="true"
                className="team-nav-indicator"
                style={{
                  height: indicator.height,
                  transform: `translateY(${indicator.top}px)`,
                }}
              />
              {sections.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={activeSection === id ? "location" : undefined}
                  className={
                    activeSection === id
                      ? "team-nav-link team-nav-link-active"
                      : "team-nav-link"
                  }
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
              <p className="font-semibold text-zinc-300">Team Draftory</p>
              <p className="mt-2 leading-5">
                Las personas que mantienen la arena activa y la comunidad
                conectada.
              </p>
            </div>
          </div>
        </aside>
        <main className="min-w-0">
          <div className="mb-10 flex items-center gap-3 text-xs text-zinc-500">
            <FaUsers className="text-zinc-400" />
            <span>Draftory</span>
            <span>/</span>
            <span>Team</span>
          </div>
          <header
            className={`team-reveal border-b border-zinc-800 pb-8 ${styles.hero}`}
          >
            <div className="flex items-start gap-5">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
                <FaUsers className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-500">
                  La gente detrás de la arena
                </p>
                <h1 className="mt-3 text-5xl font-black tracking-tight text-white">
                  Team
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">
                  Conoce a quienes construyen Draftory, orientan a los jugadores
                  y cuidan de cada partida.
                </p>
              </div>
            </div>
          </header>
          <nav
            aria-label="Secciones del equipo en móvil"
            className={styles.mobileNav}
          >
            {sections.map((section) => (
              <a
                href={"#" + section.id}
                key={section.id}
                aria-current={
                  activeSection === section.id ? "location" : undefined
                }
              >
                {section.label}
              </a>
            ))}
          </nav>
          {error && (
            <div role="alert" className={styles.warning}>
              <p>{error}</p>
              <button type="button" onClick={() => setRevision((v) => v + 1)}>
                Reintentar
              </button>
            </div>
          )}
          <section
            id="owner"
            data-team-section
            className="team-section scroll-mt-28 pt-10"
          >
            <div className="mb-5 flex items-center gap-3">
              <RankIcon rank="owner" />
              <h2 className="text-2xl font-bold">Owner</h2>
            </div>
            {feed?.owner ? (
              <MemberCard member={feed.owner} />
            ) : !feed && !error ? (
              <TeamLoading />
            ) : (
              <p className={styles.empty}>
                {error
                  ? "Información temporalmente no disponible."
                  : "No hay un propietario público disponible."}
              </p>
            )}
          </section>
          <section
            id="sponsor"
            data-team-section
            className="team-section scroll-mt-28 pt-12"
          >
            <div className="mb-5 flex items-center gap-3">
              <RankIcon rank="patrocinador" />
              <h2 className="text-2xl font-bold">Patrocinador</h2>
            </div>
            {feed?.sponsors?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {feed.sponsors.map((member, index) => (
                  <MemberCard
                    key={member.profileUrl ?? index}
                    member={member}
                  />
                ))}
              </div>
            ) : (
              <article
                className={`${styles.card} ${styles.sponsorPlaceholder}`}
              >
                <RankIcon rank="patrocinador" className="size-14" />
                <div>
                  <h3 className="text-lg font-bold">Próximamente</h3>
                  <p className={styles.description}>
                    Un espacio para quienes apoyan el futuro de Draftory.
                  </p>
                </div>
              </article>
            )}
          </section>
          <section
            id="supervisor"
            data-team-section
            className="team-section scroll-mt-28 pt-12"
          >
            <div className="mb-5 flex items-center gap-3">
              <RankIcon rank="supervisor" />
              <h2 className="text-2xl font-bold">Supervisor</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MemberCard member={communitySupervisor} community />
            </div>
          </section>
          <section
            id="staff"
            data-team-section
            className="team-section scroll-mt-28 pt-12"
          >
            <div className="mb-5 flex items-center gap-3">
              <RankIcon rank="staff" />
              <h2 className="text-2xl font-bold">Staff</h2>
            </div>
            <p className={styles.help}>
              Administradores y moderadores de Draftory. Sus cargos mantienen
              permisos independientes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {feed?.staff
                .filter(
                  (member) =>
                    member.role === "ADMIN" || member.role === "MODERATOR",
                )
                .map((member, index) => (
                  <MemberCard
                    key={`${member.role}:${member.name}:${index}`}
                    member={member}
                  />
                ))}
            </div>
            {!feed && !error ? (
              <TeamLoading />
            ) : (
              !feed?.staff.some(
                (m) => m.role === "ADMIN" || m.role === "MODERATOR",
              ) && (
                <p className={styles.empty}>
                  {error
                    ? "Información temporalmente no disponible."
                    : "No hay miembros administrativos adicionales publicados."}
                </p>
              )
            )}
          </section>
          <section
            id="helpers"
            data-team-section
            className="team-section scroll-mt-28 pt-12"
          >
            <div className="mb-5 flex items-center gap-3">
              <RankIcon rank="helper" />
              <h2 className="text-2xl font-bold">Helpers</h2>
            </div>
            <p className={styles.help}>
              Personas que ayudan a los jugadores y colaboran con el bienestar
              de la comunidad.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {feed?.staff
                .filter((m) => m.role === "HELPER")
                .map((member, index) => (
                  <MemberCard
                    key={member.profileUrl ?? index}
                    member={member}
                  />
                ))}
            </div>
            {feed && !feed.staff.some((m) => m.role === "HELPER") && (
              <p className={styles.empty}>Todavía no hay Helpers publicados.</p>
            )}
            {!feed && !error && <TeamLoading />}
          </section>
        </main>
      </div>
    </div>
  );
}
