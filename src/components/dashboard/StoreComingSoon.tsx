import Image from "next/image";
import styles from "./StoreComingSoon.module.css";

export function StoreComingSoon() {
  return (
    <section
      className={styles.page}
      aria-label="Tienda de Draftory"
      data-store-coming-soon
    >
      <div className={styles.ceiling} aria-hidden="true" />
      <div className={styles.rig}>
        <span
          className={`${styles.anchor} ${styles.leftAnchor}`}
          aria-hidden="true"
        />
        <span
          className={`${styles.anchor} ${styles.rightAnchor}`}
          aria-hidden="true"
        />
        <div className={styles.arrival}>
          <div className={styles.pendulum}>
            <Image
              className={styles.illustration}
              src="/en_desarrollo.png"
              width={1536}
              height={1024}
              alt="Windranger Arcana apoyada en un cartel de madera «EN DESARROLLO», suspendido por dos cadenas."
              draggable={false}
              priority
              unoptimized
              sizes="(max-width: 600px) calc(100vw - 24px), (max-width: 1400px) 85vw, 1080px"
            />
          </div>
        </div>
      </div>
      <div className={styles.message}>
        <h1>Estamos preparando algo especial para ti.</h1>
        <p>
          Próximamente podrás descubrir nuevas recompensas para personalizar tu
          experiencia en Draftory.
        </p>
      </div>
    </section>
  );
}
