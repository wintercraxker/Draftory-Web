"use client";

import Image from "next/image";
import betaStyles from "./HomeBeta.module.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaArrowRight,
  FaChartLine,
  FaCircleQuestion,
  FaCoins,
  FaDiscord,
  FaGamepad,
  FaPlus,
  FaSteam,
  FaUserPlus,
  FaUsers,
} from "react-icons/fa6";
import spectreImage from "./eventos/spectre_png.png";
import { useAuth } from "@/components/auth/AuthProvider";
import { useHomeStatistics } from "@/components/auth/useHomeStatistics";

const rooms = [
  [
    "aurora-vs-nova",
    "Aurora vs Nova",
    "Captain's Mode",
    "10/10",
    "EN VIVO",
    "#f0abfc",
  ],
  [
    "stacked-ancients",
    "Stacked Ancients #04",
    "All Pick",
    "8/10",
    "BUSCANDO",
    "#a5b4fc",
  ],
  [
    "nightfall-cup",
    "Nightfall Cup · Semifinal",
    "Tournament",
    "10/10",
    "EN VIVO",
    "#67e8f9",
  ],
];

const faq = [
  [
    "¿Qué es Draftory?",
    "Una comunidad dedicada a jugar Dota 2 entre amigos mediante salas personalizadas, partidas en vivo y predicciones con monedas ficticias.",
  ],
  [
    "¿Puedo crear mi propia sala?",
    "Sí. Puedes configurar el modo, la región, la privacidad y las reglas de tu sala antes de invitar a tu grupo o abrirla a la comunidad.",
  ],
  [
    "¿Las predicciones usan dinero real?",
    "No. Todas las predicciones funcionan con monedas virtuales sin valor monetario y no se pueden retirar ni comprar.",
  ],
  [
    "¿Por qué iniciar sesión con Steam?",
    "Steam permite identificar tu perfil, guardar tus salas, unirte a partidas privadas y participar en todas las funciones sociales de Draftory.",
  ],
];

export default function PublicHomePage() {
  const { user } = useAuth();
  const statistics = useHomeStatistics();
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(
      ".draftory-home main > section, .draftory-home footer",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("scroll-reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px" },
    );

    elements.forEach((element) => {
      element.classList.add("scroll-reveal");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const carousel = document.querySelector<HTMLElement>(".how-it-works-steps");
    if (
      !carousel ||
      carousel.parentElement?.querySelector(".carousel-controls")
    )
      return;

    const controls = document.createElement("div");
    controls.className = "carousel-controls";
    controls.innerHTML =
      '<button type="button" aria-label="Recuadro anterior">←</button><button type="button" aria-label="Siguiente recuadro">→</button>';
    carousel.parentElement?.appendChild(controls);

    const buttons = controls.querySelectorAll("button");
    buttons[0]?.addEventListener("click", () =>
      carousel.scrollBy({
        left: -carousel.clientWidth * 0.52,
        behavior: "smooth",
      }),
    );
    buttons[1]?.addEventListener("click", () =>
      carousel.scrollBy({
        left: carousel.clientWidth * 0.52,
        behavior: "smooth",
      }),
    );

    return () => controls.remove();
  }, []);

  return (
    <div className="draftory-home min-h-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <span
        className={betaStyles.ribbon}
        role="note"
        aria-label="Draftory en fase beta"
        data-beta-ribbon
      >
        <span aria-hidden="true">BETA</span>
      </span>
      <div className="draftory-ambient pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_92%_45%,rgba(99,102,241,0.09),transparent_28%)]" />
      <main className="relative">
        <section
          className={`mx-auto grid min-h-[calc(100svh-5rem)] max-w-7xl items-center gap-10 px-5 pb-16 pt-20 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:pt-24`}
        >
          <div className="relative z-10 max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
              <span className="size-1.5 animate-pulse rounded-full bg-cyan-300" />{" "}
              La arena está abierta
            </div>
            <h1 className="text-6xl font-black leading-[0.9] tracking-[-0.07em] sm:text-8xl">
              Tu partida.
              <br />
              <span className="text-zinc-500">Tus reglas.</span>
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-zinc-300">
              Draftory es el punto de encuentro para pasar un buen rato jugando
              Dota 2 entre amigos. Crea una sala, personalízala y deja que la
              comunidad viva cada jugada contigo.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="https://discord.gg/Aah2GJJ7Qs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-zinc-100 px-5 text-sm font-bold text-zinc-950 transition hover:bg-white"
              >
                <FaDiscord className="h-4 w-4" /> Comunidad de Discord{" "}
                <FaArrowRight className="h-3.5 w-3.5" />
              </a>
              <a
                href={user ? "/dashboard" : "#registro"}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
              >
                <FaUserPlus className="h-4 w-4" />{" "}
                {user ? "Ir al dashboard" : "Registrarse"}
              </a>
            </div>
            <div className="mt-11 flex flex-wrap gap-6 text-sm text-zinc-500">
              <span>
                <strong className="text-zinc-100">
                  {statistics
                    ? statistics.activeRooms.toLocaleString("es-CO")
                    : "—"}
                </strong>{" "}
                salas activas
              </span>
              <span>
                <strong className="text-zinc-100">
                  {statistics
                    ? statistics.connectedUsers.toLocaleString("es-CO")
                    : "—"}
                </strong>{" "}
                usuarios en salas
              </span>
              <span>
                <strong className="text-zinc-300">
                  {statistics
                    ? BigInt(statistics.committedPoints).toLocaleString("es-CO")
                    : "—"}
                </strong>{" "}
                monedas en juego
              </span>
            </div>
          </div>
          <div className="spectre-hero-panel relative min-h-[440px] lg:min-h-[560px]">
            <div className="spectre-grid absolute inset-0 opacity-30" />
            <div className="spectre-glow absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/20 blur-3xl" />
            <div className="spectre-ring absolute left-1/2 top-1/2 size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-300/20" />
            <div className="spectre-ring spectre-ring-delay absolute left-1/2 top-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-300/10" />
            <div className="absolute left-6 top-6 z-20 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <FaGamepad className="text-zinc-300" /> Dota 2 community
            </div>
            <Image
              className="spectre-hero relative z-10 mx-auto mt-20 h-[330px] w-auto object-contain drop-shadow-[0_30px_35px_rgba(0,0,0,0.9)] sm:h-[430px]"
              src={spectreImage}
              alt="Spectre de Dota 2"
              priority
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl border-t border-zinc-800 px-5 py-20 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-500">
              Todo empieza en una sala
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Juega, mira y comparte la partida.
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-500">
              Crea tu espacio para jugar con amigos o encuentra una sala
              abierta. Los jugadores disfrutan la partida y los espectadores
              pueden seguir las estadísticas en vivo y apoyar a su equipo con
              monedas ficticias.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <FaUsers className="h-5 w-5 text-cyan-300" />
              <h3 className="mt-5 font-bold">Salas personalizadas</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Configura modo, región, privacidad y reglas para que cada
                partida se sienta tuya.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <FaChartLine className="h-5 w-5 text-indigo-300" />
              <h3 className="mt-5 font-bold">Estadísticas en vivo</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Marcador, oro, torres y actividad de la partida reunidos en una
                sola vista.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <FaCoins className="h-5 w-5 text-fuchsia-300" />
              <h3 className="mt-5 font-bold">Predicciones sociales</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Apoya a tu equipo con monedas ficticias y observa cómo cambia la
                opinión de la comunidad.
              </p>
            </div>
          </div>
        </section>
        <section id="salas" className="bg-zinc-950/70">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
                  Ahora mismo
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  Salas que están pasando
                </h2>
              </div>
              <Link
                href="/salas"
                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white"
              >
                Ver todas las salas <FaArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {rooms.map(([id, title, mode, players, status, color]) => (
                <Link
                  href="/salas"
                  key={id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:-translate-y-1 hover:border-zinc-500"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-bold tracking-[0.2em]"
                      style={{ color }}
                    >
                      {status}
                    </span>
                    <FaChartLine className="h-3.5 w-3.5 text-zinc-600" />
                  </div>
                  <h3 className="mt-6 text-xl font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{mode}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs text-zinc-500">
                    <span>
                      <FaUsers className="mr-1.5 inline h-3.5 w-3.5" />
                      {players}
                    </span>
                    <span>Datos disponibles</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section
          id="funcionamiento"
          className="how-it-works mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"
        >
          <div className="how-it-works-copy">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
              Cómo funciona Draftory
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Tu comunidad empieza con Steam.
            </h2>
            <p className="mt-5 text-base leading-7 text-zinc-300">
              Al iniciar sesión con tu cuenta de Steam desbloqueas el espacio
              completo de Draftory: puedes crear tus propias salas, unirte a
              partidas de otros jugadores y configurar un perfil que represente
              tu forma de jugar.
            </p>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              En cada sala podrás seguir la partida, usar las monedas de la
              página para apoyar a un equipo y construir una reputación dentro
              de la comunidad. Tus victorias desbloquean rangos y el sistema de
              recomendaciones te ayuda a encontrar jugadores compatibles.
            </p>
            <a
              href="/api/auth/steam"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-white"
            >
              <FaSteam className="h-4 w-4" /> Entrar con Steam{" "}
              <FaArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="how-it-works-steps">
            <article>
              <FaSteam />
              <h3>Conecta tu cuenta</h3>
              <p>Accede a tu perfil, historial y salas privadas desde Steam.</p>
            </article>
            <article>
              <FaGamepad />
              <h3>Crea o únete</h3>
              <p>
                Configura una sala o encuentra una partida que encaje contigo.
              </p>
            </article>
            <article>
              <FaCoins />
              <h3>Juega y gana</h3>
              <p>Usa monedas ficticias, sube de rango y gana reconocimiento.</p>
            </article>
            <article>
              <FaUsers />
              <h3>Encuentra tu grupo</h3>
              <p>
                Las recomendaciones conectan jugadores con estilos compatibles.
              </p>
            </article>
          </div>
          <div className="marci-figure" aria-hidden="true" />
        </section>
        <section
          id="registro"
          className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"
        >
          <div className="rounded-[28px] border border-zinc-700 bg-zinc-100 px-6 py-10 text-zinc-950 sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-500">
                Tu siguiente partida empieza aquí
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                {user
                  ? "¡Ya formas parte de Draftory!"
                  : "Forma parte de Draftory."}
              </h2>
              <p className="mt-4 text-base leading-7 text-zinc-600">
                {user
                  ? "Tu próxima partida te espera. Crea una sala, reúne a tu equipo y disfruta de todo lo que Draftory tiene para ofrecerte."
                  : "Inicia sesión con Steam para crear salas, guardar tu perfil, unirte a partidas privadas y acceder a todas las funciones de la comunidad."}
              </p>
            </div>
            <a
              href={user ? "/dashboard" : "/api/auth/steam"}
              className="mt-7 inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-800 lg:mt-0"
            >
              <FaSteam className="h-4 w-4" />{" "}
              {user ? "Ir al dashboard" : "Registrarse con Steam"}
            </a>
          </div>
        </section>
        <section
          id="faq"
          className="mx-auto max-w-7xl border-t border-zinc-800 px-5 py-20 sm:px-8 lg:px-12"
        >
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-500">
                  Centro de ayuda
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  Preguntas frecuentes
                </h2>
              </div>
              <FaCircleQuestion className="mb-1 h-7 w-7 text-zinc-500" />
            </div>
            <div className="mt-8 divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950 px-5">
              {faq.map(([question, answer], index) => (
                <div key={question}>
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                    className="flex w-full items-center justify-between gap-5 py-5 text-left font-semibold"
                  >
                    <span>{question}</span>
                    <FaPlus
                      className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${openFaq === index ? "rotate-45" : ""}`}
                    />
                  </button>
                  {openFaq === index && (
                    <p className="pb-5 pr-8 text-sm leading-6 text-zinc-500">
                      {answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
