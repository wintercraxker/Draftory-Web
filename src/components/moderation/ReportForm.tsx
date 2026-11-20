"use client";
import { PlayerDisplayName } from "../players/PlayerDisplayName";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { DashboardDropdown } from "../dashboard/Dropdown";
import {
  reportCategories,
  reportCategoryInfo,
  moderationLimits,
} from "@/lib/moderation-config";
import { DashboardButton } from "../dashboard/DashboardUi";
import { AvatarImage } from "../dashboard/AvatarIdentity";
import {
  Flag,
  Search,
  Link2,
  Plus,
  X,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { playSound } from "@/lib/sounds/engine";
import styles from "./ReportForm.module.css";
type Identity = {
  name: string;
  avatar: string | null;
  publicId: string;
  self?: boolean;
};
export function ReportForm({
  targetId = "",
  target,
}: {
  targetId?: string;
  target?: Identity | null;
}) {
  const [id, setId] = useState(targetId),
    [identity, setIdentity] = useState<Identity | null>(target ?? null),
    [looking, setLooking] = useState(false),
    [identityError, setIdentityError] = useState("");
  const [category, setCategory] = useState<string>("conducta"),
    [links, setLinks] = useState([""]),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<"success" | "error" | null>(null);
  const [images, setImages] = useState<
      { id: string; file: File; url: string }[]
    >([]),
    [uploadsEnabled, setUploadsEnabled] = useState(false);
  const imageRef = useRef(images);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/reports", { cache: "no-store", signal: c.signal })
      .then((r) => r.json())
      .then((v) => {
        if (!c.signal.aborted) setUploadsEnabled(v.privateImages === true);
      })
      .catch(() => {});
    return () => {
      c.abort();
      imageRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    };
  }, []);
  function removeImage(id: string) {
    const item = images.find((i) => i.id === id);
    if (item) URL.revokeObjectURL(item.url);
    const next = images.filter((i) => i.id !== id);
    imageRef.current = next;
    setImages(next);
  }
  function selectImages(files: FileList | null) {
    if (!files) return;
    const added = [...files];
    if (
      added.length + images.length > 3 ||
      added.some(
        (f) =>
          !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
          f.size > 5 * 1024 * 1024,
      )
    ) {
      setResult("error");
      setNotice("Hasta 3 capturas PNG, JPEG o WebP de 5 MB cada una.");
      return;
    }
    const next = [
      ...images,
      ...added.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ];
    imageRef.current = next;
    setImages(next);
    setNotice("");
  }
  const inFlight = useRef(false),
    lookupVersion = useRef(0),
    submission = useRef<{ body: string; id: string } | null>(null);
  async function lookup() {
    const version = ++lookupVersion.current;
    setLooking(true);
    setIdentity(null);
    setIdentityError("");
    try {
      const r = await fetch(
        "/api/reports/identity?id=" + encodeURIComponent(id.trim()),
        { cache: "no-store" },
      );
      const v = await r.json();
      if (version !== lookupVersion.current) return;
      if (!r.ok) throw Error(v.error || "No se pudo verificar la cuenta.");
      setIdentity(v);
    } catch (e) {
      if (version === lookupVersion.current)
        setIdentityError(e instanceof Error ? e.message : "Error de consulta.");
    } finally {
      if (version === lookupVersion.current) setLooking(false);
    }
  }
  return (
    <form
      data-report-form="draftory"
      className={"dashboard-panel dashboard-form report-form " + styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current || !identity || identity.self) return;
        inFlight.current = true;
        setBusy(true);
        setNotice("");
        setResult(null);
        const values = Object.fromEntries(new FormData(e.currentTarget));
        const payload = {
          draftoryId: identity.publicId,
          category,
          subject: values.subject,
          description,
          evidence: links.map((l) => l.trim()).filter(Boolean),
        };
        const body = JSON.stringify({
          ...payload,
          images: images.map((i) => i.id),
        });
        if (submission.current?.body !== body)
          submission.current = { body, id: crypto.randomUUID() };
        try {
          const data = { ...payload, requestId: submission.current.id };
          let options: RequestInit;
          if (images.length) {
            const form = new FormData();
            form.set("payload", JSON.stringify(data));
            images.forEach((i) => form.append("images", i.file));
            options = { method: "POST", body: form };
          } else
            options = {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            };
          const r = await fetch("/api/reports", options);
          const v = await r.json();
          if (!r.ok) throw Error(v.error || "No se pudo enviar el reporte.");
          setResult("success");
          setNotice(
            "Reporte " + v.id + " guardado. El staff revisará el caso.",
          );
          void playSound("confirmation", "feedback", "report-saved:" + v.id);
        } catch (e) {
          setResult("error");
          setNotice(
            e instanceof Error
              ? e.message
              : "No se pudo confirmar el envío. Puedes reintentar sin duplicar el caso.",
          );
          void playSound("error", "feedback", submission.current.id + ":error");
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <header>
        <span className={styles.eyebrow}>COMUNIDAD · REVISIÓN HUMANA</span>
        <h2 className="dashboard-section-title">Reportar un jugador</h2>
        <p>
          Describe lo ocurrido. Un reporte no aplica sanciones automáticas y su
          contenido solo se comparte con el personal autorizado.
        </p>
      </header>
      <fieldset disabled={busy}>
        <legend>01 · Identificar al jugador</legend>
        <label htmlFor="report-df-id">ID Draftory</label>
        <div className={styles.lookup}>
          <input
            id="report-df-id"
            name="draftoryId"
            value={id}
            maxLength={11}
            required
            placeholder="DF-8K4P2X7N"
            onChange={(e) => {
              lookupVersion.current++;
              setId(e.target.value.toUpperCase());
              setIdentity(null);
              setIdentityError("");
              setLooking(false);
            }}
          />
          <DashboardButton
            disabled={looking || !/^DF-[A-Z0-9]{8}$/.test(id.trim())}
            onClick={() => void lookup()}
          >
            <Search size={14} />
            {looking ? "Buscando…" : "Verificar"}
          </DashboardButton>
        </div>
        <small>Usa el DF-ID del perfil, no el SteamID64.</small>
        {identity && (
          <div className={styles.identity}>
            <AvatarImage
              hoverReference={`public:${identity.publicId}`}
              src={identity.avatar ?? undefined}
              alt={identity.name}
              size={40}
              className="size-10 rounded-full object-cover"
            />
            <div>
              <strong>
                <PlayerDisplayName
                  id={identity.publicId}
                  name={identity.name}
                />
              </strong>
              <small>{identity.publicId}</small>
            </div>
            <CheckCircle2 size={17} />
          </div>
        )}
        {identityError && (
          <p role="alert" className={styles.error}>
            {identityError}
          </p>
        )}
        {identity?.self && <p role="alert">No puedes reportarte a ti mismo.</p>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>02 · Contexto del caso</legend>
        <label>
          Categoría
          <DashboardDropdown
            fullWidth
            name="category"
            label="Categoría del reporte"
            value={category}
            onChange={setCategory}
            options={reportCategories.map((c) => ({
              value: c,
              label: reportCategoryInfo[c].label,
            }))}
          />
        </label>
        <small>
          {
            reportCategoryInfo[category as (typeof reportCategories)[number]]
              .description
          }
        </small>
        <label>
          Asunto
          <input
            required
            name="subject"
            maxLength={moderationLimits.subject}
            placeholder="Resumen breve de lo ocurrido"
          />
        </label>
        <label>
          Descripción
          <textarea
            required
            name="description"
            rows={5}
            maxLength={moderationLimits.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explica el contexto, las personas involucradas y qué ocurrió."
          />
        </label>
        <small className={styles.counter}>
          {description.length} / {moderationLimits.description}
        </small>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>03 · Evidencias complementarias</legend>
        <p>
          Añade hasta 3 enlaces HTTPS. No compartas contraseñas ni datos
          sensibles.
        </p>
        {links.map((link, index) => (
          <div className={styles.link} key={index}>
            <Link2 size={15} />
            <input
              type="url"
              aria-label={"Enlace de evidencia " + (index + 1)}
              maxLength={1000}
              placeholder="https://…"
              value={link}
              onChange={(e) =>
                setLinks(
                  links.map((v, i) => (i === index ? e.target.value : v)),
                )
              }
            />
            <DashboardButton
              size="icon"
              aria-label={"Quitar enlace " + (index + 1)}
              onClick={() => setLinks(links.filter((_, i) => i !== index))}
            >
              <X size={14} />
            </DashboardButton>
          </div>
        ))}
        <DashboardButton
          disabled={links.length >= 3}
          onClick={() => setLinks([...links, ""])}
        >
          <Plus size={14} />
          Añadir enlace
        </DashboardButton>
        <div className={styles.attachments}>
          <ImagePlus size={22} />
          <div>
            <strong>Capturas privadas</strong>
            <small>
              {uploadsEnabled
                ? "Hasta 3 imágenes PNG, JPEG o WebP de 5 MB. Solo Staff autorizado podrá verlas."
                : "El almacenamiento privado no está disponible."}
            </small>
          </div>
          <label className={styles.fileButton}>
            Añadir capturas
            <input
              aria-label="Adjuntar capturas privadas"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={!uploadsEnabled || busy || images.length >= 3}
              onChange={(e) => {
                selectImages(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className={styles.previews}>
          {images.map((image, index) => (
            <figure key={image.id}>
              <Image
                src={image.url}
                width={110}
                height={74}
                unoptimized
                alt={"Captura seleccionada " + (index + 1)}
              />
              <figcaption>Captura {index + 1}</figcaption>
              <DashboardButton
                aria-label={"Quitar captura " + (index + 1)}
                disabled={busy}
                onClick={() => removeImage(image.id)}
              >
                <X size={13} />
              </DashboardButton>
            </figure>
          ))}
        </div>
      </fieldset>
      <div className={styles.footer}>
        <DashboardButton
          type="submit"
          variant="primary"
          busy={busy}
          disabled={!identity || identity.self || busy}
        >
          <Flag size={14} />
          {busy ? "Enviando…" : "Enviar reporte"}
        </DashboardButton>
        <small>Sin sanciones automáticas</small>
      </div>
      {notice && (
        <p
          role={result === "error" ? "alert" : "status"}
          className={"settings-feedback settings-feedback-" + result}
        >
          {result === "success" ? (
            <CheckCircle2 size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
          <span>{notice}</span>
        </p>
      )}
    </form>
  );
}
