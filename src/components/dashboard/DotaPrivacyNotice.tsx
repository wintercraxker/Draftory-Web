import Image from "next/image";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ProfileDataState } from "@/lib/dota-stats/profile-state";
export function DotaPrivacyNotice({
  isOwner,
  state = "NO_DATA",
}: {
  isOwner: boolean;
  state?: ProfileDataState;
}) {
  if (
    state === "AVAILABLE" ||
    state === "PRIVATE_DRAFTORY" ||
    state === "STALE"
  )
    return null;
  const pending = state === "FIRST_SYNC_PENDING",
    technical = state === "TECHNICAL_ERROR";
  const title = !isOwner
    ? "Estadísticas de Dota 2 no disponibles"
    : pending
      ? "Estamos preparando tus estadísticas de Dota 2…"
      : technical
        ? "No pudimos actualizar tus estadísticas en este momento."
        : "No pudimos acceder a tus estadísticas de Dota 2.";
  const guidance = isOwner && !pending && !technical;
  return (
    <aside
      className={`marci-stats-notice ${guidance ? "marci-stats-guidance" : "marci-stats-compact"}`}
      role="status"
    >
      <div className="marci-stats-content">
        <header className="marci-stats-heading">
          <p className="dashboard-label">Marci · Dota 2</p>
          <h3>
            {pending && (
              <LoaderCircle
                size={16}
                className="marci-activity animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {title}
          </h3>
        </header>
        <div className="marci-stats-body">
          <p className="marci-stats-description">
            {!isOwner
              ? "Este jugador no tiene suficientes estadísticas públicas disponibles en Draftory."
              : pending
                ? "Esto puede tardar un momento. Puedes seguir explorando Draftory."
                : technical
                  ? "Puedes volver a intentarlo cuando la actualización esté disponible. Tu cuenta y progreso de Draftory siguen funcionando."
                  : state === "NOT_PUBLIC"
                    ? "El proveedor indica que el perfil no está publicado en su servicio. Comprueba también si tus estadísticas de partidas pueden compartirse desde Dota 2."
                    : "Es posible que necesites activar «Compartir estadísticas de partidas». Esta recomendación no confirma que la opción esté desactivada."}
          </p>
          {guidance && (
            <div className="marci-stats-guide">
              <h4>¿Cómo activar tus estadísticas?</h4>
              <ol className="marci-stats-steps">
                <li>Abre Dota 2 en tu PC.</li>
                <li>Entra en Configuración (la rueda dentada).</li>
                <li>Abre la pestaña Social.</li>
                <li>
                  Activa <strong>Compartir estadísticas de partidas</strong>.
                </li>
                <li>
                  Vuelve a Draftory y espera la siguiente sincronización
                  disponible.
                </li>
              </ol>
              <p className="marci-stats-footnote">
                Salas, ELO y progreso interno son independientes de estos datos.
              </p>
            </div>
          )}
          {isOwner && !pending && (
            <Link
              href="/configuracion?tab=dota"
              className="dashboard-link-button marci-stats-action"
            >
              Configuración → Dota 2
            </Link>
          )}
        </div>
      </div>
      <div className="marci-stats-artwork" aria-hidden="true">
        <Image
          src="/marci_Advertencia.png"
          alt=""
          width={1024}
          height={1536}
          className="marci-stats-image"
          draggable={false}
        />
      </div>
    </aside>
  );
}
