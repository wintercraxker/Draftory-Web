"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Flag,
  HelpCircle,
  Scale,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { PageHeader, DashboardButton } from "../dashboard/DashboardUi";
import { ProfileTabs } from "../dashboard/ProfileTabs";
import { ReportForm } from "./ReportForm";
import {
  regulations,
  terms,
  faq,
  sanctionRows,
  officialDiscord,
  type InformationSection,
} from "@/lib/information-content";
import { sanctionKindLabels } from "@/lib/moderation-presentation";
import s from "./RulesContent.module.css";

function Index({
  entries,
  prefix,
}: {
  entries: readonly { id: string; title: string }[];
  prefix: string;
}) {
  const [current, setCurrent] = useState(entries[0]?.id ?? "");
  useEffect(() => {
    const targets = entries
      .map((entry) => document.getElementById(`${prefix}-${entry.id}`))
      .filter((node): node is HTMLElement => !!node);
    const observer = new IntersectionObserver(
      (changes) => {
        const visible = changes
          .filter(
            (entry) =>
              entry.isIntersecting && !entry.target.closest("[hidden]"),
          )
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0])
          setCurrent(visible[0].target.id.slice(prefix.length + 1));
      },
      { rootMargin: "-95px 0px -55% 0px", threshold: 0 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [entries, prefix]);
  const links = (
    <ol>
      {entries.map((entry, i) => (
        <li key={entry.id}>
          <a
            href={`#${prefix}-${entry.id}`}
            aria-current={current === entry.id ? "location" : undefined}
            onClick={() => setCurrent(entry.id)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {entry.title.replace(/^\d+\.\s*/, "")}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <aside className={s.index}>
      <nav className={s.desktopIndex} aria-label="Índice de secciones">
        <p>EN ESTA GUÍA</p>
        {links}
      </nav>
      <details className={s.mobileIndex}>
        <summary>
          Índice de secciones
          <ChevronDown size={16} />
        </summary>
        <nav aria-label="Índice de secciones móvil">{links}</nav>
      </details>
    </aside>
  );
}
function Sanctions() {
  return (
    <div
      className={s.sanctions}
      role="region"
      aria-label="Sanciones disponibles"
    >
      <table>
        <thead>
          <tr>
            <th>Medida</th>
            <th>Alcance actual</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          {sanctionRows.map((row) => (
            <tr key={row.kind}>
              <th scope="row">{sanctionKindLabels[row.kind]}</th>
              <td>{row.effect}</td>
              <td>{row.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Las propuestas de 1 h y 24 h requieren aprobación. Una denuncia no
        aplica ninguna de estas medidas por sí sola.
      </p>
    </div>
  );
}
function Support() {
  return (
    <a
      className={s.support}
      href={officialDiscord}
      target="_blank"
      rel="noopener noreferrer"
    >
      Discord oficial de Draftory
      <ExternalLink size={14} />
    </a>
  );
}
function Guide({
  entries,
  prefix,
}: {
  entries: InformationSection[];
  prefix: string;
}) {
  return (
    <div className={s.layout}>
      <Index entries={entries} prefix={prefix} />
      <div className={s.sections}>
        {entries.map((entry, i) => (
          <article
            id={`${prefix}-${entry.id}`}
            key={entry.id}
            className={s.article}
          >
            <header>
              <span className={s.number}>{String(i + 1).padStart(2, "0")}</span>
              <h2>{entry.title.replace(/^\d+\.\s*/, "")}</h2>
            </header>
            <p>{entry.intro}</p>
            {entry.points && (
              <ul>
                {entry.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {entry.note && (
              <p className={s.note}>
                <ShieldCheck size={16} />
                <span>{entry.note}</span>
              </p>
            )}
            {prefix === "reglamento" && entry.id === "sanciones" && (
              <Sanctions />
            )}
            {entry.id === "apelaciones" && <Support />}
          </article>
        ))}
      </div>
    </div>
  );
}
export function RulesContent({
  targetId = "",
  target,
  initialReport = false,
}: {
  targetId?: string;
  target?: { name: string; avatar: string | null; publicId: string } | null;
  initialReport?: boolean;
}) {
  const visited = useRef(new Set([0]));
  const [firstVisit, setFirstVisit] = useState(false);
  const [active, setActive] = useState(0),
    [reportOpen, setReportOpen] = useState(!!targetId || initialReport);
  return (
    <section
      className={`${s.root} dashboard-enter rules-page`}
      data-first-visit={firstVisit}
    >
      <div className={s.pageHeader}>
        <span className={s.mark} aria-hidden="true">
          <ShieldCheck size={28} />
        </span>
        <PageHeader
          eyebrow="COMUNIDAD · JUEGO LIMPIO"
          title="Centro de información"
          description="Tu guía para competir con confianza y formar parte de Draftory."
          action={
            <DashboardButton
              className={s.reportAction}
              onClick={() => setReportOpen((value) => !value)}
            >
              {reportOpen ? <ArrowLeft size={15} /> : <Flag size={15} />}{" "}
              {reportOpen ? "Volver al centro" : "Reportar jugador"}
            </DashboardButton>
          }
        />
      </div>
      {reportOpen ? (
        <ReportForm targetId={targetId} target={target} />
      ) : (
        <>
          <div className={s.intro}>
            <ShieldCheck size={21} />
            <div>
              <strong>Competimos con respeto.</strong>
              <p>
                Reglas claras, contexto y evidencias. Las decisiones de
                moderación corresponden al staff autorizado.
              </p>
            </div>
            <span>GUÍA DE COMUNIDAD</span>
          </div>
          <ProfileTabs
            labels={[
              "Reglamento",
              "Términos y Condiciones",
              "Preguntas frecuentes",
            ]}
            icons={[
              <BookOpen size={17} key="rules" />,
              <Scale size={17} key="terms" />,
              <HelpCircle size={17} key="faq" />,
            ]}
            activeIndex={active}
            onActiveChange={(index) => {
              setFirstVisit(!visited.current.has(index));
              visited.current.add(index);
              setActive(index);
            }}
            ariaLabel="Centro de información"
          >
            {[
              <div key="rules">
                <div className={s.panelHeader}>
                  <p className={s.eyebrow}>NUESTRA FORMA DE JUGAR</p>
                  <h2>Reglamento de Draftory</h2>
                  <p>
                    Consulta las normas y los criterios de revisión. Las
                    duraciones propuestas están identificadas y no cambian las
                    reglas del servidor.
                  </p>
                </div>
                <Guide entries={regulations} prefix="reglamento" />
              </div>,
              <div key="terms">
                <div className={s.draft} role="note">
                  <Scale size={20} />
                  <div>
                    <strong>
                      Borrador · Pendiente de revisión legal y aprobación
                    </strong>
                    <p>
                      Sin fecha de vigencia. No se solicita una aceptación nueva
                      ni retroactiva. La identidad del operador y la Política de
                      Privacidad deben completarse antes de su publicación
                      definitiva.
                    </p>
                  </div>
                </div>
                <div className={s.panelHeader}>
                  <p className={s.eyebrow}>TRANSPARENCIA Y CONFIANZA</p>
                  <h2>Términos y Condiciones de Uso</h2>
                  <p>
                    Un texto de preparación para comprender el servicio y las
                    responsabilidades de nuestra comunidad.
                  </p>
                </div>
                <Guide entries={terms} prefix="terminos" />
                <Support />
              </div>,
              <div key="faq">
                <div className={s.panelHeader}>
                  <p className={s.eyebrow}>RESPUESTAS PARA SEGUIR JUGANDO</p>
                  <h2>Preguntas frecuentes</h2>
                  <p>
                    Desde tu primera sala hasta la gestión de tu cuenta. Abre
                    cada pregunta para conocer los detalles.
                  </p>
                </div>
                <div className={s.layout}>
                  <Index entries={faq} prefix="faq" />
                  <div className={s.sections}>
                    {faq.map((category) => (
                      <section
                        id={`faq-${category.id}`}
                        key={category.id}
                        className={s.faqCategory}
                      >
                        <header>
                          <h2>{category.title}</h2>
                          <span>{category.items.length} respuestas</span>
                        </header>
                        {category.items.map(([question, answer]) => (
                          <details className={s.question} key={question}>
                            <summary>
                              {question}
                              <ChevronDown size={16} />
                            </summary>
                            <p>{answer}</p>
                          </details>
                        ))}
                      </section>
                    ))}
                    <div className={s.help}>
                      <strong>¿Necesitas ayuda con un caso concreto?</strong>
                      <p>
                        Comunícalo por los canales oficiales, sin compartir
                        contraseñas ni códigos de seguridad.
                      </p>
                      <Support />
                    </div>
                  </div>
                </div>
              </div>,
            ]}
          </ProfileTabs>
        </>
      )}
    </section>
  );
}
