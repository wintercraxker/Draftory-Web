import Link from "next/link";
import {
  Bug,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  Clock3,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  changelogCategories,
  featureStates,
  draftChangelog,
  publishedChangelog,
  type ChangelogEntry,
} from "@/lib/changelog";
import styles from "./Changelog.module.css";
const icons = {
  news: Sparkles,
  improvements: Wrench,
  fixes: Bug,
  stability: ShieldCheck,
  coming: Clock3,
};
function Entry({ entry }: { entry: ChangelogEntry }) {
  return (
    <li className={styles.entry} data-status={entry.status}>
      <article aria-labelledby={`update-${entry.id}`}>
        <div className={styles.entryMeta}>
          <span className={styles.version}>
            {entry.version ? `v${entry.version}` : "Versión por confirmar"}
          </span>
          {entry.status === "draft" && (
            <span className={styles.draftBadge}>
              Lanzamiento en preparación
            </span>
          )}
          <span className={styles.date}>
            <CalendarDays size={13} aria-hidden="true" />
            {entry.status === "published" ? (
              <time dateTime={entry.publishedAt}>
                {new Intl.DateTimeFormat("es-CO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(entry.publishedAt + "T12:00:00Z"))}
              </time>
            ) : (
              "Fecha por confirmar"
            )}
          </span>
        </div>
        <h3 id={`update-${entry.id}`}>{entry.title}</h3>
        <p className={styles.description}>{entry.description}</p>
        {entry.introduction && (
          <div className={styles.introduction}>
            {entry.introduction.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        )}
        {entry.betaNote && (
          <aside className={styles.betaNote}>
            <Sparkles size={18} aria-hidden="true" />
            <div>
              <h4>¿Qué significa estar en beta?</h4>
              <p>{entry.betaNote}</p>
            </div>
          </aside>
        )}
        <p className={styles.scope}>
          Los estados describen la validación de las funciones existentes. No
          confirman un despliegue público. Las funciones pendientes y futuras se
          presentan por separado.
        </p>
        <div className={styles.groups}>
          {entry.groups.map((group) => {
            const Icon = icons[group.category];
            return (
              <section
                key={group.category}
                aria-label={changelogCategories[group.category]}
              >
                <details open={group.category === "news"}>
                  <summary className={styles.groupSummary}>
                    <h4
                      className={styles.category}
                      data-category={group.category}
                    >
                      <Icon size={13} aria-hidden="true" />
                      {changelogCategories[group.category]}
                    </h4>
                    <span>
                      {group.items.length} cambios
                      <ChevronDown size={14} aria-hidden="true" />
                    </span>
                  </summary>
                  <ul>
                    {group.items.map((item, i) => (
                      <li key={i}>
                        {item.title && (
                          <div className={styles.featureHeading}>
                            <h5>{item.title}</h5>
                            {item.state && (
                              <span
                                className={styles.featureState}
                                data-feature-state={item.state}
                              >
                                {featureStates[item.state]}
                              </span>
                            )}
                          </div>
                        )}
                        {item.href ? (
                          <Link href={item.href}>
                            {item.text}
                            <ChevronRight size={12} aria-hidden="true" />
                          </Link>
                        ) : (
                          item.text
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            );
          })}
        </div>
      </article>
    </li>
  );
}
export function Changelog() {
  const published = publishedChangelog(),
    drafts = draftChangelog();
  return (
    <section className={styles.page} data-changelog>
      <header className={styles.header}>
        <span className={styles.icon}>
          <ScrollText size={23} aria-hidden="true" />
        </span>
        <div>
          <p className={styles.eyebrow}>REGISTRO DE CAMBIOS</p>
          <h1>Actualizaciones de Draftory</h1>
          <p className={styles.subtitle}>
            Descubre las novedades, mejoras y correcciones que llegan a nuestra
            comunidad.
          </p>
        </div>
      </header>
      {!!published.length && (
        <section aria-labelledby="published-updates">
          <div className={styles.sectionHeading}>
            <h2 id="published-updates">Publicaciones</h2>
            <span>{published.length} versiones publicadas</span>
          </div>
          <ol className={styles.timeline}>
            {published.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      )}
      {!!drafts.length && (
        <section aria-labelledby="draft-updates">
          <div className={styles.sectionHeading}>
            <h2 id="draft-updates">El comienzo de una nueva etapa</h2>
            <span>Vista previa · Sin publicar</span>
          </div>
          <ol className={styles.timeline} data-changelog-drafts>
            {drafts.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      )}
      <footer className={styles.footer}>
        <Link href="/reglas">
          Consultar reglas de Draftory
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}
