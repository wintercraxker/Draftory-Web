"use client";
import Image from "next/image";
import { useId, useState } from "react";
import { DashboardDialog } from "../dashboard/DashboardDialog";
import { DashboardButton } from "../dashboard/DashboardUi";
import styles from "./EvidenceGallery.module.css";
type Evidence = { kind?: string; src?: string; url?: string };
export function EvidenceGallery({ evidence }: { evidence: unknown }) {
  const all = Array.isArray(evidence)
    ? evidence.filter(
        (v): v is Evidence => !!v && typeof v === "object" && !Array.isArray(v),
      )
    : [];
  const images = all.filter(
    (v) =>
      v.kind === "image" &&
      typeof v.src === "string" &&
      /^\/api\/staff\/reports\/[a-zA-Z0-9_-]+\/evidence\/[0-5]$/.test(v.src),
  );
  const links = all.filter(
    (v) => typeof v.url === "string" && /^https?:\/\//i.test(v.url),
  );
  const [selected, setSelected] = useState<number | null>(null),
    [failed, setFailed] = useState<Record<string, boolean>>({});
  const id = useId();
  const picture = (src: string, index: number, large = false) =>
    failed[src] ? (
      <span role="status">
        No se pudo cargar la captura. Actualiza la página o verifica tu acceso.
      </span>
    ) : (
      <Image
        src={src}
        width={large ? 1600 : 180}
        height={large ? 1100 : 120}
        unoptimized
        alt={"Captura privada " + (index + 1)}
        onError={() => setFailed((v) => ({ ...v, [src]: true }))}
      />
    );
  return (
    <div data-evidence-gallery className={styles.root}>
      {links.map((v, i) => (
        <a
          key={i}
          href={v.url}
          target="_blank"
          rel="noopener noreferrer"
          className="staff-evidence-link"
        >
          Abrir evidencia original {i + 1} ↗
        </a>
      ))}
      <div className={styles.grid}>
        {images.map((v, i) => (
          <button
            type="button"
            key={v.src}
            onClick={() => setSelected(i)}
            aria-label={"Ampliar captura privada " + (i + 1)}
          >
            {picture(v.src!, i)}
            <span>Captura {i + 1} · Ampliar</span>
          </button>
        ))}
      </div>
      {!all.length && (
        <p className="staff-help">No se adjuntaron evidencias.</p>
      )}
      {selected !== null && (
        <DashboardDialog wide titleId={id} onClose={() => setSelected(null)}>
          <div
            className={styles.viewer}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setSelected(
                  (selected +
                    (e.key === "ArrowRight" ? 1 : images.length - 1)) %
                    images.length,
                );
              }
            }}
          >
            <header>
              <h3 id={id}>
                Evidencia privada · {selected + 1} de {images.length}
              </h3>
              <DashboardButton onClick={() => setSelected(null)}>
                Cerrar
              </DashboardButton>
            </header>
            {picture(images[selected].src!, selected, true)}
            <footer>
              <DashboardButton
                disabled={images.length < 2}
                onClick={() =>
                  setSelected((selected + images.length - 1) % images.length)
                }
              >
                Anterior
              </DashboardButton>
              <span>Solo personal autorizado</span>
              <DashboardButton
                disabled={images.length < 2}
                onClick={() => setSelected((selected + 1) % images.length)}
              >
                Siguiente
              </DashboardButton>
            </footer>
          </div>
        </DashboardDialog>
      )}
    </div>
  );
}
