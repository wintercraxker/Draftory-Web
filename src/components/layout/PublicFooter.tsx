"use client";
import Link from "next/link";
import { FaDiscord, FaSteam } from "react-icons/fa6";
import { useAuth } from "../auth/AuthProvider";
import styles from "./PublicFooter.module.css";
export function PublicFooter() {
  const { user } = useAuth();
  return (
    <footer
      id="discord"
      className={`${styles.footer} border-t border-zinc-800 bg-black px-5 py-16 text-sm text-zinc-500 sm:px-8 lg:px-12`}
    >
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-md">
          <p className="text-xl font-bold text-zinc-100">
            draftory<span className="text-zinc-500">.lol</span>
          </p>
          <p className="mt-4 leading-7">
            Una comunidad dedicada a jugar Dota 2 entre amigos, crear salas
            totalmente personalizadas y compartir la emoción de cada partida con
            estadísticas en vivo.
          </p>
          <p className="mt-3 leading-7">
            Las predicciones funcionan con monedas ficticias sin valor real.
            Draftory existe para jugar, competir y pasar un buen rato.
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href="https://discord.gg/Aah2GJJ7Qs"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="grid size-9 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 hover:text-white"
            >
              <FaDiscord />
            </a>
          </div>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.2em] text-zinc-200">
            Explora
          </p>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/salas" className="hover:text-white">
                Salas
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.2em] text-zinc-200">
            Draftory
          </p>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/team" className="hover:text-white">
                Team
              </Link>
            </li>
            <li>
              <Link href="/#faq" className="hover:text-white">
                Preguntas frecuentes
              </Link>
            </li>
            {user && (
              <li>
                <Link href="/reglas" className="hover:text-white">
                  Reglas
                </Link>
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.2em] text-zinc-200">
            Juega conectado
          </p>
          {user ? (
            <>
              <p className="mt-4 leading-6">
                Crea tu sala, reúne a tus amigos y prepara la próxima partida.
              </p>
              <Link
                href="/salas"
                className="mt-4 inline-flex items-center gap-2 text-zinc-200 hover:text-white"
              >
                <FaSteam /> Ir a Salas
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 leading-6">
                Conecta Steam para guardar tu progreso, crear salas privadas y
                unirte a la comunidad.
              </p>
              <a
                href="/api/auth/steam"
                className="mt-4 inline-flex items-center gap-2 text-zinc-200 hover:text-white"
              >
                <FaSteam /> Conectar Steam
              </a>
            </>
          )}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-zinc-800 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getUTCFullYear()} draftory.lol</span>
        <span>Dota 2 · Monedas ficticias</span>
      </div>
    </footer>
  );
}
