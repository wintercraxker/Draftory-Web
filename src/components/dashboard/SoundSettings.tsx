"use client";
import { useEffect, useState } from "react";
import { Volume2, MessageCircle, Info } from "lucide-react";
import {
  defaultSoundPreferences,
  initializeSounds,
  readSoundPreferences,
  saveSoundPreferences,
  readSoundPlaybackState,
  playSound,
  type SoundPreferences,
} from "@/lib/sounds/engine";
import styles from "./SoundSettings.module.css";
export function SoundSettings() {
  const [value, setValue] = useState<SoundPreferences>(defaultSoundPreferences);
  const [playback, setPlayback] =
    useState<ReturnType<typeof readSoundPlaybackState>>("idle");
  useEffect(() => {
    initializeSounds();
    const read = () => setValue(readSoundPreferences());
    read();
    window.addEventListener("draftory:sounds-preferences", read);
    const status = () => setPlayback(readSoundPlaybackState());
    window.addEventListener("draftory:sound-status", status);
    return () => {
      window.removeEventListener("draftory:sounds-preferences", read);
      window.removeEventListener("draftory:sound-status", status);
    };
  }, []);
  const update = (patch: Partial<SoundPreferences>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveSoundPreferences(next);
  };
  return (
    <section className={styles.root} aria-label="Sonidos de Draftory">
      <header>
        <span className={styles.eyebrow}>TU EXPERIENCIA</span>
        <h2 className="dashboard-section-title">Sonidos de Draftory</h2>
        <p>
          Controla lo que escuchas. Tus preferencias se guardan en este
          navegador.
        </p>
      </header>
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>
              <Volume2 size={21} />
            </span>
            <div>
              <h3>Sonidos de la plataforma</h3>
              <p>Efectos discretos para los momentos importantes.</p>
            </div>
          </div>
          <label className={styles.toggle}>
            <span>
              <strong>Efectos de sonido</strong>
              <small>
                Notificaciones, salas, confirmaciones y recompensas.
              </small>
            </span>
            <input
              role="switch"
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              aria-label="Activar sonidos de la plataforma"
            />
          </label>
          <label className={styles.volume}>
            <span>
              Volumen general <output>{Math.round(value.volume * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Volumen de la plataforma"
              value={Math.round(value.volume * 100)}
              onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
            />
            <small>Silenciar los efectos no oculta ningún aviso.</small>
          </label>
          <button
            type="button"
            className="hub-button hub-button-secondary hub-button-sm mt-4"
            disabled={!value.enabled || value.volume === 0}
            onClick={() =>
              void playSound(
                "notification",
                "notifications",
                "preview:" + crypto.randomUUID(),
              )
            }
          >
            Probar sonido
          </button>
          <p role="status" className="settings-help mt-3">
            {
              {
                idle: "Interactúa con la página antes de recibir sonidos. Solo suenan en la pestaña visible.",
                interaction:
                  "El audio necesita una interacción previa. Pulsa Probar sonido.",
                muted:
                  "Los sonidos están desactivados o el volumen está a cero.",
                background:
                  "No se reproduce audio desde pestañas en segundo plano.",
                coordination:
                  "El audio requiere HTTPS y un navegador con Web Locks para evitar duplicados entre pestañas.",
                blocked:
                  "El navegador bloqueó el audio. Revisa el permiso de sonido del sitio y pulsa Probar sonido.",
                error:
                  "No se pudo cargar o reproducir el sonido. Puedes volver a probar.",
                played:
                  "Reproducción iniciada. Comprueba también el volumen de tu dispositivo.",
                ended: "Sonido finalizado.",
              }[playback]
            }
          </p>
        </article>
        <article className={styles.card}>
          <div className={styles.heading}>
            <span className={styles.icon}>
              <MessageCircle size={21} />
            </span>
            <div>
              <h3>
                Chat Wheel <span className={styles.future}>Preparación</span>
              </h3>
              <p>Preferencia de escucha para audios de jugadores.</p>
            </div>
          </div>
          <label className={styles.toggle}>
            <span>
              <strong>Escuchar Chat Wheel</strong>
              <small>Independiente de los sonidos de la plataforma.</small>
            </span>
            <input
              role="switch"
              type="checkbox"
              checked={value.chatWheelEnabled}
              onChange={(e) => update({ chatWheelEnabled: e.target.checked })}
              aria-label="Permitir escuchar Chat Wheel"
            />
          </label>
          <label className={styles.volume}>
            <span>
              Volumen de Chat Wheel{" "}
              <output>{Math.round(value.chatWheelVolume * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Volumen de Chat Wheel"
              value={Math.round(value.chatWheelVolume * 100)}
              onChange={(e) =>
                update({ chatWheelVolume: Number(e.target.value) / 100 })
              }
            />
            <small>
              Chat Wheel aún no está disponible. Esta preferencia se aplicará
              cuando se incorpore.
            </small>
          </label>
        </article>
      </div>
      <p className={styles.notice}>
        <Info size={15} />
        Las notificaciones visuales, invitaciones y ReadyCheck siguen
        funcionando aunque silencies el audio.
      </p>
    </section>
  );
}
