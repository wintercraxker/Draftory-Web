"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaDiscord,
  FaTwitch,
  FaYoutube,
  FaXTwitter,
  FaGithub,
} from "react-icons/fa6";
import {
  socialPlatforms,
  socialLabels,
  validateSocialLinks,
  normalizeSocialUrl,
  socialIdentifier,
  socialTooltip,
  type SocialPlatform,
  type ProfileSocials as SocialData,
} from "@/lib/profile-socials";
import styles from "./ProfileSocials.module.css";
const icons = {
  discord: FaDiscord,
  twitch: FaTwitch,
  youtube: FaYoutube,
  x: FaXTwitter,
  github: FaGithub,
};
export function SocialIcon({
  platform,
}: {
  platform: SocialPlatform | "dotabuff";
}) {
  if (platform === "dotabuff")
    return (
      <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="5" fill="#c44742" />
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fill="white"
          fontSize="14"
          fontWeight="800"
          fontFamily="Arial,sans-serif"
        >
          DB
        </text>
      </svg>
    );
  const Icon = icons[platform];
  return <Icon size={17} aria-hidden="true" />;
}
export function SocialLink({
  platform,
  url,
  context,
}: {
  platform: SocialPlatform | "dotabuff";
  url: string;
  context?: string;
}) {
  const tip = useRef<HTMLSpanElement>(null),
    ref = useRef<HTMLAnchorElement>(null),
    id = useId(),
    [open, setOpen] = useState(false),
    [point, setPoint] = useState({ x: 0, y: 0 });
  const label = platform === "dotabuff" ? "Dotabuff" : socialLabels[platform],
    description =
      socialTooltip(platform, url) + (context ? ` · ${context}` : "");
  useLayoutEffect(() => {
    const panel = tip.current;
    if (!open || !panel) return;
    panel.style.left = `${Math.max(12, Math.min(point.x, innerWidth - panel.offsetWidth - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(point.y, innerHeight - panel.offsetHeight - 12))}px`;
  }, [open, point.x, point.y]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node))
        return;
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      setPoint({
        x: Math.max(12, Math.min(r.left, innerWidth - 125)),
        y: r.top > 48 ? r.top - 40 : r.bottom + 8,
      });
      setOpen(true);
    }
  }
  return (
    <>
      <a
        ref={ref}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        aria-label={context ? `${label} · ${context}` : label}
        aria-describedby={open ? id : undefined}
        className={styles.link}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show();
        }}
        onPointerLeave={() => setOpen(false)}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          if (
            e.detail !== 0 &&
            matchMedia("(pointer: coarse)").matches &&
            !open
          ) {
            e.preventDefault();
            show();
          }
        }}
      >
        <SocialIcon platform={platform} />
      </a>
      {open &&
        createPortal(
          <span
            ref={tip}
            id={id}
            role="tooltip"
            className={styles.tooltip}
            style={{ left: point.x, top: point.y }}
          >
            {description}
          </span>,
          document.body,
        )}
    </>
  );
}
export function ProfileSocialLinks({ userId }: { userId: string }) {
  return <SocialRead key={userId} userId={userId} />;
}
function SocialRead({ userId }: { userId: string }) {
  const [data, setData] = useState<SocialData | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void fetch(`/api/profiles/${encodeURIComponent(userId)}/socials`, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (r.ok) {
          const v = await r.json();
          if (!c.signal.aborted)
            setData({ ...v, links: validateSocialLinks(v.links) });
        }
      })
      .catch(() => {});
    return () => c.abort();
  }, [userId]);
  if (!data) return null;
  return (
    <div className={styles.links} aria-label="Redes sociales">
      {socialPlatforms.map((p) => {
        const url = data.links[p] ?? (p === "dotabuff" ? data.dotabuff : null);
        return url ? (
          <SocialLink
            key={p}
            platform={p}
            url={url}
            context={
              data.links[p]
                ? "Enlace publicado por el jugador, sin verificar"
                : "Generado desde Steam, solo visible para ti; perfil externo sin verificar"
            }
          />
        ) : null;
      })}
    </div>
  );
}
export function SocialSettings({ userId }: { userId: string }) {
  return <SocialEditor key={userId} />;
}
function SocialEditor() {
  const [data, setData] = useState<SocialData | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false),
    sending = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/profile/socials", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("No se pudieron cargar tus redes.");
        const v = await r.json();
        if (!c.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(true);
          setNotice(e.message);
        }
      });
    return () => c.abort();
  }, []);
  return (
    <form
      className="dashboard-panel settings-panel"
      data-social-settings
      onSubmit={async (e) => {
        e.preventDefault();
        if (!data || sending.current) return;
        let links;
        try {
          links = validateSocialLinks(
            Object.fromEntries(new FormData(e.currentTarget)),
          );
        } catch (e) {
          setNotice(e instanceof Error ? e.message : "Enlaces inválidos.");
          setError(true);
          return;
        }
        sending.current = true;
        setBusy(true);
        setNotice("");
        try {
          const r = await fetch("/api/profile/socials", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(links),
            }),
            v = await r.json();
          if (!r.ok)
            throw Error(v.error ?? "No se pudieron guardar las redes.");
          setData(v);
          setError(false);
          setNotice("Redes sociales guardadas.");
          window.dispatchEvent(new Event("draftory:profile-updated"));
        } catch (e) {
          setError(true);
          setNotice(
            e instanceof Error
              ? e.message
              : "No se pudieron guardar las redes.",
          );
        } finally {
          sending.current = false;
          setBusy(false);
        }
      }}
    >
      <h3 className="dashboard-section-title">Redes sociales</h3>
      <p className={styles.hint}>
        Enlaces de perfil introducidos por ti, sin verificación de titularidad.
        Solo se muestran a otros jugadores cuando tu perfil es público. Borra un
        campo para retirar su enlace.
      </p>
      <fieldset
        disabled={!data || busy}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        {socialPlatforms
          .filter((p) => p !== "dotabuff" || data?.dotabuffEditable)
          .map((p) =>
            p === "dotabuff" && data?.dotabuffGenerated ? (
              <AutomaticDotabuffField
                key={`auto:${data.links.dotabuff ?? ""}`}
                generated={data.dotabuffGenerated}
                initial={data.links.dotabuff ?? ""}
              />
            ) : (
              <SocialField
                key={`${p}:${data?.links[p] ?? ""}`}
                platform={p}
                initial={data?.links[p] ?? ""}
              />
            ),
          )}
      </fieldset>
      {data && !data.dotabuffEditable && (
        <p className={`${styles.hint} mt-4`}>
          El enlace configurable de Dotabuff está pendiente de activación. Las
          demás redes siguen disponibles.
        </p>
      )}
      <div className="settings-save-row">
        <button
          className="dashboard-primary-button"
          type="submit"
          disabled={!data || busy}
        >
          {busy ? "Guardando…" : "Guardar redes"}
        </button>
        {notice && (
          <p role={error ? "alert" : "status"} className={styles.hint}>
            {notice}
          </p>
        )}
      </div>
    </form>
  );
}

function AutomaticDotabuffField({
  generated,
  initial,
}: {
  generated: string;
  initial: string;
}) {
  const [published, setPublished] = useState(initial === generated),
    [legacy, setLegacy] = useState(
      initial && initial !== generated ? initial : "",
    );
  return (
    <div className="text-xs sm:col-span-2" data-dotabuff-automatic>
      <label className="block font-semibold" htmlFor="dotabuff-generated">
        Dotabuff
      </label>
      <p className={`${styles.hint} mt-1`}>
        Enlace obtenido desde tu cuenta Steam.
      </p>
      <span className={`${styles.field} mt-2`}>
        <SocialIcon platform="dotabuff" />
        <input
          id="dotabuff-generated"
          className="settings-input"
          aria-label="Enlace de Dotabuff generado desde Steam"
          value={generated}
          readOnly
        />
      </span>
      <label className="mt-3 flex items-start gap-2 leading-5">
        <input
          type="checkbox"
          className="mt-1 accent-purple-400"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          aria-label="Mostrar Dotabuff en mi perfil público"
        />
        Mostrar Dotabuff en mi perfil público
      </label>
      <input
        type="hidden"
        name="dotabuff"
        value={published ? generated : legacy}
      />
      {!!legacy && (
        <div className="mt-3 rounded-lg border border-zinc-700 p-3">
          <p className="break-all leading-5">
            Enlace anterior conservado: {legacy}
          </p>
          <p className={`${styles.hint} mt-1`}>
            {published
              ? "Al guardar se usará el enlace de tu Steam en lugar del anterior."
              : "Tu enlace anterior sigue publicado según la privacidad de tu perfil."}
          </p>
          <button
            type="button"
            className="dashboard-link-button mt-2"
            onClick={() => setLegacy("")}
          >
            Retirar enlace anterior al guardar
          </button>
        </div>
      )}
    </div>
  );
}

function SocialField({
  platform,
  initial,
}: {
  platform: SocialPlatform;
  initial: string;
}) {
  const [value, setValue] = useState(
    initial ? socialIdentifier(platform, initial) : "",
  );
  let normalized: string | null = null;
  try {
    normalized = normalizeSocialUrl(platform, value);
  } catch {}
  return (
    <label className="text-xs">
      {socialLabels[platform]}
      <span className={`${styles.field} mt-2`}>
        <SocialIcon platform={platform} />
        <input
          type="text"
          name={platform}
          maxLength={250}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          placeholder={
            platform === "discord"
              ? "ID de Discord"
              : platform === "dotabuff"
                ? "URL de jugador o ID de Dotabuff"
                : platform === "github"
                  ? "usuario"
                  : "@usuario"
          }
          className="settings-input"
        />
      </span>
      {normalized && <span className={styles.preview}>{normalized}</span>}
    </label>
  );
}
