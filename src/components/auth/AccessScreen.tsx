import Image from "next/image";
import Link from "next/link";
import { FaSteam } from "react-icons/fa6";
import styles from "./AccessScreen.module.css";

function ErrorCharacter() {
  return (
    <div className={styles.errorArt} aria-hidden="true">
      <Image
        src="/error_drow.png"
        width={1254}
        height={1254}
        alt=""
        preload
        unoptimized
      />
    </div>
  );
}

export function AccessScreen({ denied = false }: { denied?: boolean }) {
  return (
    <main
      className={styles.screen}
      data-access-screen={denied ? "denied" : "login"}
    >
      <section className={styles.composition}>
        <ErrorCharacter />
        <div className={styles.content}>
          <h1>{denied ? "Acceso restringido" : "Necesitas iniciar sesión"}</h1>
          <p>
            {denied
              ? "No tienes permisos para acceder al Panel de Staff"
              : "Inicia sesión con Steam para continuar tu experiencia en Draftory"}
          </p>
          <div className={styles.actions}>
            {denied ? (
              <Link className={styles.primary} href="/dashboard">
                Ir al dashboard
              </Link>
            ) : (
              <>
                <a className={styles.primary} href="/api/auth/steam">
                  <FaSteam aria-hidden="true" />
                  Iniciar sesión con Steam
                </a>
                <Link className={styles.secondary} href="/">
                  Volver al inicio
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export function TechnicalErrorScreen({
  retry,
  busy = false,
}: {
  retry: () => void;
  busy?: boolean;
}) {
  return (
    <main className={styles.screen} data-access-error>
      <section className={styles.composition}>
        <ErrorCharacter />
        <div className={styles.content}>
          <h1>Algo salió mal</h1>
          <p role="alert">
            No pudimos preparar el panel. Comprueba tu conexión y vuelve a
            intentarlo.
          </p>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={retry} disabled={busy}>
              {busy ? "Reintentando…" : "Reintentar"}
            </button>
            <Link className={styles.secondary} href="/">
              Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function StaffLoading({ exiting = false }: { exiting?: boolean } = {}) {
  return (
    <main
      className={`${styles.screen} ${styles.loading} ${exiting ? styles.leaving : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-staff-loading
      data-exiting={exiting || undefined}
    >
      <section className={`${styles.composition} ${styles.loaderComposition}`}>
        <div className={styles.loaderEntrance} aria-hidden="true">
          <div className={styles.loaderFloat}>
            <Image
              className={styles.loaderImage}
              src="/drow_loader.png"
              width={1024}
              height={1536}
              alt=""
              preload
              unoptimized
            />
          </div>
        </div>
        <div className={styles.content}>
          <h1>Preparando panel de Staff</h1>
          <p>Comprobando tu acceso y preparando el panel</p>
          <div className={styles.track} aria-hidden="true">
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}
