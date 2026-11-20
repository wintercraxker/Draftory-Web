"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Users,
  Search,
  Plus,
  ArrowLeft,
  Settings,
  X,
  Check,
  Mail,
  UserPlus,
} from "lucide-react";
import { DotaMedal } from "../dashboard/DotaMedal";
import { useAuth } from "../auth/AuthProvider";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import { DashboardDialog } from "../dashboard/DashboardDialog";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import {
  clanRoleLabel,
  type ClanDetail,
  type ClanFeed,
  type ClanSummary,
} from "@/lib/clans";
import s from "./ClanPanel.module.css";
import { ClanHistory } from "./ClanHistory";
function Crest({
  clan,
  large = false,
}: {
  clan: Pick<ClanSummary, "shield" | "tag">;
  large?: boolean;
}) {
  return (
    <div className={large ? s.crestLarge : s.crest}>
      {clan.shield ? (
        <AvatarImage
          src={clan.shield}
          alt={"Escudo " + clan.tag}
          size={large ? 88 : 48}
          className={s.shield}
        />
      ) : (
        <Shield size={large ? 42 : 25} aria-hidden />
      )}
    </div>
  );
}
type Confirmation = {
  title: string;
  description: string;
  payload: Record<string, unknown>;
};
export function ClanPanel() {
  const { user } = useAuth(),
    path = usePathname(),
    router = useRouter(),
    id = path.startsWith("/clan/") ? path.split("/")[2] : null;
  const [feed, setFeed] = useState<ClanFeed | null>(null),
    [detail, setDetail] = useState<ClanDetail | null>(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [directory, setDirectory] = useState(false),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [name, setName] = useState(""),
    [tag, setTag] = useState(""),
    [description, setDescription] = useState(""),
    [image, setImage] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [invite, setInvite] = useState(""),
    [found, setFound] = useState<{
      name: string;
      publicId: string;
      avatar: string | null;
      clan: string | null;
      preferredRole?: string | null;
    } | null>(null);
  const [settingsTab, setSettingsTab] = useState("general"),
    [removeShield, setRemoveShield] = useState(false);
  const active = useRef(true),
    generation = useRef(0),
    operation = useRef<string | null>(null),
    submitting = useRef(false);
  const load = useCallback(async () => {
    const n = ++generation.current;
    try {
      const r = await fetch(
          "/api/clans?q=" + encodeURIComponent(query) + "&page=" + page,
          { cache: "no-store" },
        ),
        data = await r.json();
      if (!r.ok) throw Error(data.error ?? "No se pudo cargar el clan.");
      let d: ClanDetail | null = null;
      if (id && data.enabled) {
        const response = await fetch("/api/clans/" + encodeURIComponent(id), {
            cache: "no-store",
          }),
          body = await response.json();
        if (!response.ok) throw Error(body.error);
        d = body;
      }
      if (active.current && n === generation.current) {
        setFeed(data);
        setDetail(d);
        setError("");
      }
    } catch (e) {
      if (active.current && n === generation.current)
        setError(e instanceof Error ? e.message : "No se pudo cargar el clan.");
    }
  }, [id, query, page]);
  useEffect(() => {
    active.current = true;
    const requestClock = generation;
    const t = setTimeout(() => void load(), 200);
    const update = () => void load();
    window.addEventListener("draftory:clans-updated", update);
    return () => {
      active.current = false;
      requestClock.current++;
      clearTimeout(t);
      window.removeEventListener("draftory:clans-updated", update);
    };
  }, [load]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function command(payload: Record<string, unknown>, withImage = false) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const requestId = operation.current ?? crypto.randomUUID();
    operation.current = requestId;
    try {
      const body = { ...payload, requestId };
      let r: Response;
      if (withImage && image) {
        const form = new FormData();
        form.set("payload", JSON.stringify(body));
        form.set("image", image);
        r = await fetch("/api/clans", { method: "POST", body: form });
      } else
        r = await fetch("/api/clans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const value = await r.json();
      if (!r.ok) {
        if (r.status < 500) operation.current = null;
        throw Error(value.error ?? "No se pudo guardar.");
      }
      operation.current = null;
      if (!active.current) return;
      setNotice("Cambios guardados.");
      setConfirmation(null);
      setCreating(false);
      setEditing(false);
      setImage(null);
      setPreview(null);
      setInvite("");
      setFound(null);
      window.dispatchEvent(new Event("draftory:clans-updated"));
      window.dispatchEvent(new Event("draftory:notifications-updated"));
      if (payload.action === "create") router.push("/clan/" + value.clanId);
      else if (payload.action === "disband" || payload.action === "leave")
        router.push("/clan");
      await load();
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo guardar. Puedes reintentar.",
        );
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }
  function confirm(
    title: string,
    description: string,
    payload: Record<string, unknown>,
  ) {
    operation.current = null;
    setError("");
    setConfirmation({ title, description, payload });
  }
  function startEdit(c: ClanDetail | null) {
    setError("");
    operation.current = null;
    setName(c?.name ?? "");
    setTag(c?.tag ?? "");
    setDescription(c?.description ?? "");
    setImage(null);
    setPreview(null);
    setRemoveShield(false);
    setSettingsTab(c?.viewerRole === "OFFICER" ? "invitations" : "general");
    if (c) setEditing(!editing);
    else setCreating(true);
  }
  async function findPlayer() {
    setError("");
    setFound(null);
    try {
      const r = await fetch(
          "/api/clans/players?q=" + encodeURIComponent(invite),
          { cache: "no-store" },
        ),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      setFound(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Jugador no disponible.");
    }
  }
  const clan = id ? detail : feed?.mine,
    admin = clan?.viewerRole === "LEADER" || clan?.viewerRole === "OFFICER",
    leader = clan?.viewerRole === "LEADER";
  const editor = (
    <form
      className={s.editor}
      onSubmit={(e) => {
        e.preventDefault();
        confirm(
          creating ? "Confirmar creación" : "Guardar identidad del clan",
          "Revisa el escudo, el nombre y las siglas antes de continuar.",
          {
            action: creating ? "create" : "edit",
            clanId: clan?.id,
            name,
            tag,
            description,
            ...(!creating && removeShield ? { removeShield: true } : {}),
          },
        );
      }}
    >
      <div className={s.sectionTitle}>
        <h2>{creating ? "Crea tu identidad" : "Identidad del clan"}</h2>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Cerrar formulario"
          disabled={busy}
          onClick={() => {
            setCreating(false);
            setEditing(false);
          }}
        >
          <X size={18} />
        </button>
      </div>
      <div className={s.fields}>
        <label>
          Nombre del clan
          <input
            required
            minLength={3}
            maxLength={32}
            value={name}
            onChange={(e) => {
              operation.current = null;
              setName(e.target.value);
            }}
            placeholder="Nombre de tu equipo"
          />
        </label>
        <label>
          Siglas · máximo 6
          <input
            required
            maxLength={6}
            value={tag}
            onChange={(e) => {
              operation.current = null;
              setTag(e.target.value.toUpperCase());
            }}
            pattern="[A-Z0-9]{1,6}"
            placeholder="TAG"
          />
        </label>
      </div>
      <label>
        Descripción <span className={s.secondary}>(opcional)</span>
        <textarea
          maxLength={280}
          rows={3}
          value={description}
          onChange={(e) => {
            operation.current = null;
            setDescription(e.target.value);
          }}
          placeholder="Qué os une como equipo"
        />
      </label>
      <div className={s.shieldEditor}>
        <label className={s.shieldPicker}>
          <Crest
            clan={{
              shield: preview ?? (removeShield ? null : (clan?.shield ?? null)),
              tag: tag || "DF",
            }}
            large
          />
          <span>
            <strong>{image ? "Escudo seleccionado" : "Elige tu escudo"}</strong>
            <small>JPG, PNG o WebP · hasta 5 MB</small>
            <small>Recorte cuadrado centrado · WebP optimizado</small>
            <span className={s.chooseFile}>
              {preview || clan?.shield
                ? "Reemplazar imagen"
                : "Seleccionar imagen"}
            </span>
          </span>
          <input
            key={removeShield ? "removed" : "selected"}
            className={s.fileInput}
            aria-label="Seleccionar escudo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              operation.current = null;
              const file = e.target.files?.[0];
              if (file && file.size > 5 * 1024 * 1024) {
                setError("El escudo debe pesar como máximo 5 MB.");
                return;
              }
              setError("");
              setRemoveShield(false);
              setImage(file ?? null);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>
        {!creating && (clan?.shield || preview) && !removeShield && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              operation.current = null;
              setRemoveShield(true);
              setImage(null);
              setPreview(null);
            }}
          >
            Quitar escudo
          </button>
        )}
      </div>
      <div className={s.preview}>
        <Crest
          clan={{
            shield: preview ?? (removeShield ? null : (clan?.shield ?? null)),
            tag: tag || "DF",
          }}
        />
        <div>
          <strong>{name || "Tu clan"}</strong>
          <p>
            <PlayerDisplayName
              name={user?.player?.name ?? "Tu nombre"}
              tag={tag || null}
            />
          </p>
        </div>
      </div>
      <button className="dashboard-primary-button" disabled={busy}>
        Revisar {creating ? "creación" : "cambios"}
      </button>
    </form>
  );
  const invitations = feed?.invitations ?? [];
  return (
    <section className={s.page} aria-label="Clanes de Draftory">
      <header className={s.heading}>
        <div>
          <p className={s.eyebrow}>IDENTIDAD · COMUNIDAD · EQUIPO</p>
          <h1>{id ? "Tu estandarte en Draftory" : "Clan"}</h1>
          <p>Un equipo. Una identidad. Vuestra próxima historia.</p>
        </div>
        {(id || directory) && (
          <Link
            href="/clan"
            onClick={() => setDirectory(false)}
            className={s.link}
          >
            <ArrowLeft size={16} />
            Mi clan
          </Link>
        )}
      </header>
      {error && (
        <div className={s.error} role="alert">
          {error}{" "}
          <button onClick={() => void load()}>Reintentar lectura</button>
        </div>
      )}
      {notice && (
        <p className={s.success} role="status">
          {notice}
        </p>
      )}
      {!feed && !error && <p role="status">Cargando clanes…</p>}
      {feed && !feed.enabled && (
        <div className={s.welcome}>
          <Shield size={44} />
          <h2>Estamos preparando los clanes</h2>
          <p>
            La sección está pendiente de activación. Tus datos y tu identidad se
            conservan.
          </p>
        </div>
      )}
      {feed?.enabled && (
        <>
          {invitations.length > 0 && (
            <section className={s.section}>
              <h2>
                <Mail size={18} />
                Invitaciones recibidas
              </h2>
              {invitations.map((r) => (
                <div className={s.request} key={r.id}>
                  <div>
                    <strong>{r.clanName}</strong>
                    <small>{r.tag} · Te invitan a formar parte</small>
                  </div>
                  <div className={s.actions}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Aceptar invitación",
                          "Te unirás a " + r.clanName + ".",
                          { action: "accept", id: r.id, clanId: r.clanId },
                        )
                      }
                    >
                      Aceptar
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Rechazar invitación",
                          "No te incorporarás a este clan.",
                          { action: "reject", id: r.id, clanId: r.clanId },
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {!clan && !creating && !id && !directory && (
            <div className={s.welcome}>
              <div className={s.standard}>
                <Shield size={66} />
              </div>
              <p className={s.eyebrow}>ENCUENTRA TU EQUIPO</p>
              <h2>
                La próxima historia
                <br />
                la escribís juntos.
              </h2>
              <p>
                Forma tu clan, reúne a tus jugadores y construye tu identidad
                dentro de Draftory.
              </p>
              <div className={s.actions}>
                <button
                  className="dashboard-primary-button"
                  onClick={() => startEdit(null)}
                >
                  <Plus size={16} />
                  Crear clan
                </button>
                <button onClick={() => setDirectory(true)}>
                  <Search size={16} />
                  Explorar clanes
                </button>
              </div>
            </div>
          )}
          {creating && editor}
          {clan && (
            <>
              <div className={s.banner}>
                <Crest clan={clan} large />
                <div className={s.bannerCopy}>
                  <p className={s.eyebrow}>{clan.tag} · CLAN DE DRAFTORY</p>
                  <h2>{clan.name}</h2>
                  <p>
                    {clan.description ||
                      "Un equipo que comparte su camino en Draftory."}
                  </p>
                  <div className={s.metadata}>
                    <span>
                      <Users size={14} />
                      {clan.count} / 10{" "}
                      {clan.count === 10 ? "· Clan completo" : "integrantes"}
                    </span>
                    <span>
                      Desde{" "}
                      {new Date(clan.createdAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <span>
                      {"L\u00edder"} ·{" "}
                      {clan.members.find((m) => m.role === "LEADER")?.name}
                    </span>
                  </div>
                </div>
                <div className={s.actions}>
                  {admin && (
                    <button
                      aria-expanded={editing}
                      onClick={() => startEdit(clan)}
                    >
                      <Settings size={16} />
                      Configuración
                    </button>
                  )}
                  {clan.viewerRole && clan.viewerRole !== "LEADER" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Abandonar clan",
                          "Tu nombre original y tus estadísticas se conservarán.",
                          { action: "leave", clanId: clan.id },
                        )
                      }
                    >
                      Abandonar
                    </button>
                  )}
                  {!feed.mine && !clan.viewerRole && (
                    <button
                      className="dashboard-primary-button"
                      disabled={
                        busy || clan.count === 10 || !!clan.viewerRequest
                      }
                      onClick={() =>
                        confirm(
                          "Solicitar ingreso",
                          "Los administradores revisarán tu solicitud.",
                          { action: "apply", clanId: clan.id },
                        )
                      }
                    >
                      <UserPlus size={16} />
                      {clan.viewerRequest === "APPLICATION"
                        ? "Solicitud pendiente"
                        : clan.viewerRequest === "INVITE"
                          ? "Invitación pendiente"
                          : "Solicitar ingreso"}
                    </button>
                  )}
                </div>
              </div>
              {!editing && <ClanHistory key={clan.id} clanId={clan.id} />}
              {editing && (
                <nav
                  className={s.settingsNav}
                  aria-label="Configuración del clan"
                >
                  {[
                    ...(leader ? [["general", "General"]] : []),
                    ["members", "Miembros"],
                    ["invitations", "Invitaciones"],
                    ["administration", "Administración"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={settingsTab === key}
                      onClick={() => setSettingsTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              )}
              {editing && leader && settingsTab === "general" && editor}
              {editing && settingsTab === "administration" && (
                <section className={s.administration}>
                  <h2>Administración del equipo</h2>
                  <p>
                    Los cambios de liderazgo y las salidas conservan el
                    historial del clan.
                  </p>
                  {leader ? (
                    <button onClick={() => setSettingsTab("members")}>
                      Elegir un nuevo líder en Miembros
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "Abandonar clan",
                          "Tu nombre original y tus estadísticas se conservarán.",
                          { action: "leave", clanId: clan.id },
                        )
                      }
                    >
                      Abandonar clan
                    </button>
                  )}
                </section>
              )}
              <section
                className={s.section}
                hidden={editing && settingsTab !== "members"}
              >
                <div className={s.sectionTitle}>
                  <h2>Roster</h2>
                  <span className={s.secondary}>
                    {10 - clan.count}{" "}
                    {clan.count === 9
                      ? "plaza disponible"
                      : "plazas disponibles"}
                  </span>
                </div>
                <div className={s.roster}>
                  {clan.members.map((m) => (
                    <article
                      key={m.id}
                      className={s.member}
                      data-clan-role={m.role}
                    >
                      <AvatarImage
                        id={m.href ? m.id : undefined}
                        src={m.avatar ?? undefined}
                        alt={m.name}
                        size={48}
                        className={s.memberAvatar}
                      />
                      <div className={s.memberCopy}>
                        {m.href ? (
                          <Link href={m.href} prefetch={false}>
                            <PlayerDisplayName
                              id={m.id}
                              name={m.name}
                              tag={clan.tag}
                            />
                          </Link>
                        ) : (
                          <strong>Jugador privado</strong>
                        )}
                        <p>
                          {clanRoleLabel[m.role]}
                          {m.preferredRole
                            ? " · " +
                              ({
                                CARRY: "Hard Carry",
                                MID: "Midlaner",
                                OFFLANE: "Offlaner",
                                SUPPORT: "Support",
                                HARD_SUPPORT: "Hard Support",
                              }[m.preferredRole] ?? m.preferredRole)
                            : ""}
                        </p>
                        {m.publicId && <small>{m.publicId}</small>}
                        {m.level && (
                          <small className={s.memberLevel}>
                            Nivel {m.level}
                          </small>
                        )}
                      </div>
                      {m.medal && (
                        <span
                          className={s.rosterMedal}
                          title={
                            m.medal.source?.startsWith("MANUAL")
                              ? "Medalla declarada"
                              : "Medalla almacenada"
                          }
                        >
                          <DotaMedal
                            rankTier={m.medal.tier}
                            leaderboardRank={m.medal.leaderboardRank}
                            image={m.medal.image}
                            name={m.medal.name}
                          />
                        </span>
                      )}
                      {admin && m.id !== user?.id && m.role !== "LEADER" && (
                        <details className={s.memberMenu}>
                          <summary aria-label={"Administrar a " + m.name}>
                            •••
                          </summary>
                          <div>
                            {leader && (
                              <>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    confirm(
                                      "Cambiar rol",
                                      "Se actualizarán sus permisos internos.",
                                      {
                                        action: "role",
                                        clanId: clan.id,
                                        userId: m.id,
                                        role:
                                          m.role === "OFFICER"
                                            ? "MEMBER"
                                            : "OFFICER",
                                      },
                                    )
                                  }
                                >
                                  {m.role === "OFFICER"
                                    ? "Quitar oficial"
                                    : "Hacer oficial"}
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    confirm(
                                      "Transferir liderazgo",
                                      "Dejarás de ser líder. El nuevo líder administrará el clan.",
                                      {
                                        action: "transfer",
                                        clanId: clan.id,
                                        userId: m.id,
                                      },
                                    )
                                  }
                                >
                                  Transferir liderazgo
                                </button>
                              </>
                            )}
                            {(leader || m.role === "MEMBER") && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  confirm(
                                    "Expulsar integrante",
                                    "El jugador dejará de pertenecer al clan.",
                                    {
                                      action: "kick",
                                      clanId: clan.id,
                                      userId: m.id,
                                    },
                                  )
                                }
                              >
                                Expulsar
                              </button>
                            )}
                          </div>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              {admin && (
                <section
                  className={s.section}
                  hidden={editing && settingsTab !== "invitations"}
                >
                  <h2>
                    <UserPlus size={18} />
                    Reclutar jugadores
                  </h2>
                  <p className={s.secondary}>
                    Busca una identidad pública por su DF-ID. Nadie entra sin
                    aceptar.
                  </p>
                  <form
                    className={s.search}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void findPlayer();
                    }}
                  >
                    <label className={s.srOnly} htmlFor="clan-invite">
                      DF-ID del jugador
                    </label>
                    <input
                      id="clan-invite"
                      value={invite}
                      maxLength={11}
                      onChange={(e) => {
                        setInvite(e.target.value.toUpperCase());
                        setFound(null);
                      }}
                      placeholder="DF-XXXXXXXX"
                    />
                    <button disabled={busy || clan.count === 10}>
                      Buscar jugador
                    </button>
                  </form>
                  {found && (
                    <div className={s.request}>
                      <AvatarImage
                        hoverReference={"public:" + found.publicId}
                        src={found.avatar ?? undefined}
                        alt={found.name}
                        size={36}
                      />
                      <div>
                        <strong>{found.name}</strong>
                        <small>
                          {found.publicId}
                          {found.preferredRole
                            ? " · " +
                              ({
                                CARRY: "Hard Carry",
                                MID: "Midlaner",
                                OFFLANE: "Offlaner",
                                SUPPORT: "Support",
                                HARD_SUPPORT: "Hard Support",
                              }[found.preferredRole] ?? found.preferredRole)
                            : ""}
                          {found.clan ? " · Ya pertenece a " + found.clan : ""}
                        </small>
                      </div>
                      <button
                        disabled={busy || !!found.clan || clan.count === 10}
                        onClick={() =>
                          confirm(
                            "Invitar jugador",
                            found.name + " recibirá una invitación.",
                            {
                              action: "invite",
                              clanId: clan.id,
                              publicId: found.publicId,
                            },
                          )
                        }
                      >
                        Invitar
                      </button>
                    </div>
                  )}
                </section>
              )}
              {admin && clan.requests.length > 0 && (
                <section
                  className={s.section}
                  hidden={editing && settingsTab !== "invitations"}
                >
                  <h2>Invitaciones y solicitudes</h2>
                  {clan.requests.map((r) => (
                    <div key={r.id} className={s.request}>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {r.kind === "INVITE"
                            ? "Invitación pendiente de respuesta"
                            : "Solicitud de ingreso"}
                          {r.publicId ? " · " + r.publicId : ""}
                        </small>
                      </div>
                      {r.kind === "INVITE" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            confirm(
                              "Cancelar invitación",
                              "La invitación dejará de estar disponible.",
                              { action: "reject", clanId: clan.id, id: r.id },
                            )
                          }
                        >
                          Cancelar invitación
                        </button>
                      )}
                      {r.kind === "APPLICATION" && (
                        <div className={s.actions}>
                          <button
                            disabled={busy}
                            onClick={() =>
                              confirm(
                                "Aceptar solicitud",
                                "El jugador se unirá si todavía hay una plaza disponible.",
                                { action: "accept", clanId: clan.id, id: r.id },
                              )
                            }
                          >
                            Aceptar
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              confirm(
                                "Rechazar solicitud",
                                "El jugador será notificado.",
                                { action: "reject", clanId: clan.id, id: r.id },
                              )
                            }
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {leader && editing && settingsTab === "administration" && (
                <div className={s.danger}>
                  <div>
                    <strong>Disolver clan</strong>
                    <p>
                      Se retirarán las membresías y las invitaciones. El
                      historial se conserva.
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        "Disolver clan",
                        "Esta acción cerrará el clan y retirará a todos sus integrantes. Se conservará la trazabilidad administrativa.",
                        { action: "disband", clanId: clan.id, confirm: true },
                      )
                    }
                  >
                    Disolver clan
                  </button>
                </div>
              )}
            </>
          )}
          {!creating && !id && (
            <section className={s.section}>
              <div className={s.sectionTitle}>
                <h2>Explora los clanes</h2>
                <span className={s.secondary}>
                  Identidades de nuestra comunidad
                </span>
              </div>
              <form className={s.search} onSubmit={(e) => e.preventDefault()}>
                <Search size={18} />
                <label className={s.srOnly} htmlFor="clan-search">
                  Buscar clan
                </label>
                <input
                  id="clan-search"
                  placeholder="Buscar por nombre o siglas"
                  value={query}
                  maxLength={64}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </form>
              {feed.items.length ? (
                <div className={s.directory}>
                  {feed.items.map((c) => (
                    <Link
                      key={c.id}
                      href={"/clan/" + c.id}
                      className={s.clanCard}
                    >
                      <Crest clan={c} />
                      <div>
                        <small>{c.tag}</small>
                        <h3>{c.name}</h3>
                        <p>{c.count} / 10 integrantes</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={s.empty}>
                  Todavía no hay clanes que coincidan con tu búsqueda.
                </p>
              )}
              <div className={s.pagination}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  disabled={!feed.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {confirmation && (
        <DashboardDialog
          wide
          titleId="clan-confirm-title"
          dismissible={!busy}
          onClose={() => {
            setConfirmation(null);
            operation.current = null;
          }}
        >
          <div className={s.confirm}>
            <div className={s.sectionTitle}>
              <h2 id="clan-confirm-title">{confirmation.title}</h2>
              <button
                className={s.iconButton}
                aria-label="Cerrar confirmación"
                disabled={busy}
                onClick={() => {
                  setConfirmation(null);
                  operation.current = null;
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p>{confirmation.description}</p>
            {["create", "edit"].includes(
              String(confirmation.payload.action),
            ) && (
              <div className={s.preview}>
                <Crest
                  clan={{
                    shield:
                      preview ?? (removeShield ? null : (clan?.shield ?? null)),
                    tag,
                  }}
                />
                <div>
                  <strong>{name}</strong>
                  <p>
                    <PlayerDisplayName
                      name={user?.player?.name ?? "Tu nombre"}
                      tag={tag}
                    />
                  </p>
                </div>
              </div>
            )}
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                disabled={busy}
                onClick={() => {
                  setConfirmation(null);
                  operation.current = null;
                }}
              >
                Cancelar
              </button>
              <button
                className="dashboard-primary-button"
                disabled={busy}
                onClick={() =>
                  void command(
                    confirmation.payload,
                    ["create", "edit"].includes(
                      String(confirmation.payload.action),
                    ),
                  )
                }
              >
                <Check size={16} />
                {busy ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </DashboardDialog>
      )}
    </section>
  );
}
