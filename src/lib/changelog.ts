// Editorial source of truth. Publish only after confirming the real date and release scope.
export const changelogCategories = {
  news: "Novedades",
  improvements: "Mejoras",
  fixes: "Correcciones",
  stability: "Seguridad y estabilidad",
  coming: "Próximamente",
} as const;
export type ChangelogCategory = keyof typeof changelogCategories;
export const featureStates = {
  available: "Disponible y verificada",
  activation: "Implementada, pendiente de activación",
  development: "En desarrollo",
  planned: "Planificada",
  implemented: "Implementado en desarrollo",
  testing: "En pruebas",
} as const;
export type FeatureState = keyof typeof featureStates;
export type ChangelogItem = {
  title?: string;
  state?: FeatureState;
  text: string;
  href?:
    | "/reglas"
    | "/team"
    | "/tienda"
    | "/partidas"
    | "/predicciones"
    | "/clasificacion";
};
type EntryBody = {
  id: string;
  title: string;
  description: string;
  introduction?: readonly string[];
  betaNote?: string;
  groups: readonly {
    category: ChangelogCategory;
    items: readonly ChangelogItem[];
  }[];
};
export type ChangelogEntry = EntryBody &
  (
    | { status: "draft"; version: string | null; publishedAt: null }
    | { status: "published"; version: string; publishedAt: string }
  );
const semver = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const routes = new Set([
  "/reglas",
  "/team",
  "/tienda",
  "/partidas",
  "/predicciones",
  "/clasificacion",
]);
export function validateChangelog(
  entries: readonly ChangelogEntry[],
): readonly ChangelogEntry[] {
  const ids = new Set<string>(),
    versions = new Set<string>();
  for (const entry of entries) {
    if (
      !/^[a-z0-9-]+$/.test(entry.id) ||
      ids.has(entry.id) ||
      !entry.title?.trim() ||
      !entry.description?.trim()
    )
      throw Error("INVALID_CHANGELOG_ENTRY");
    ids.add(entry.id);
    if (entry.version !== null && !semver.test(entry.version))
      throw Error("INVALID_CHANGELOG_VERSION");
    if (entry.status === "published") {
      if (
        !entry.version ||
        versions.has(entry.version) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt)
      )
        throw Error("INVALID_CHANGELOG_PUBLICATION");
      const date = new Date(entry.publishedAt + "T00:00:00Z");
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== entry.publishedAt
      )
        throw Error("INVALID_CHANGELOG_DATE");
      versions.add(entry.version);
    } else if (entry.status !== "draft" || entry.publishedAt !== null)
      throw Error("DRAFT_CANNOT_HAVE_PUBLICATION_DATE");
    if (!Array.isArray(entry.groups) || !entry.groups.length)
      throw Error("CHANGELOG_GROUPS_REQUIRED");
    const categories = new Set<string>();
    for (const group of entry.groups) {
      if (
        !Object.hasOwn(changelogCategories, group.category) ||
        categories.has(group.category) ||
        !Array.isArray(group.items) ||
        !group.items.length
      )
        throw Error("INVALID_CHANGELOG_GROUP");
      categories.add(group.category);
      for (const item of group.items) {
        if (
          !item.text?.trim() ||
          (item.href !== undefined && !routes.has(item.href))
        )
          throw Error("INVALID_CHANGELOG_ITEM_OR_LINK");
        if (
          item.state !== undefined &&
          !Object.hasOwn(featureStates, item.state)
        )
          throw Error("INVALID_FEATURE_STATE");
        if (
          item.title !== undefined &&
          (!item.title.trim() || item.state === undefined)
        )
          throw Error("FEATURE_STATE_REQUIRED");
      }
    }
  }
  return entries;
}
// Release preparation. This entry does not announce a production launch.
export const changelogEntries = validateChangelog([
  {
    id: "public-beta-draft",
    status: "draft",
    version: "0.1.0-beta",
    publishedAt: null,
    title: "Draftory Beta — Comienza nuestra aventura",
    description:
      "Una nueva etapa para jugar, organizar encuentros y crecer juntos como comunidad de Dota 2.",
    introduction: [
      "¡Bienvenidos a la próxima beta pública de Draftory! Después de meses de desarrollo, estamos preparando la apertura de nuestra comunidad.",
      "Podrás descubrir la plataforma, participar en encuentros y ayudarnos a mejorar. Esta es una vista previa del lanzamiento: su fecha y disponibilidad pública todavía están por confirmar.",
      "Gracias por acompañarnos desde los primeros pasos. Tus comentarios nos ayudarán a decidir qué mejorar y qué construir después.",
    ],
    betaNote:
      "Estar en beta significa seguir evolucionando: algunas funciones pueden cambiar y pueden aparecer errores inesperados. Seguiremos corrigiendo problemas, mejorando el rendimiento y añadiendo novedades con las sugerencias de la comunidad.",
    groups: [
      {
        category: "news",
        items: [
          {
            title: "Salas para reunir a tu equipo",
            state: "available",
            text: "Creación de salas públicas y privadas con contraseña e identificador propio. Equipos Radiant y Dire, banco de jugadores y gestión de miembros para organizar cada encuentro.",
          },
          {
            title: "Tu identidad en Draftory",
            state: "available",
            text: "Inicio de sesión con Steam, perfil público o privado, avatar, información personal, país, región y roles preferidos. Tus controles de privacidad deciden qué información compartes.",
          },
          {
            title: "Tu clan, tu identidad",
            state: "available",
            text: "Clanes de hasta diez integrantes con escudo, nombre y siglas. Invitaciones, solicitudes, líder, oficiales y miembros, configuración y transferencia segura del liderazgo.",
          },
          {
            title: "Mini perfiles globales",
            state: "available",
            text: "Consulta identidad, clan, medalla guardada de Dota 2, nivel, insignias oficiales y logros reales sin salir del chat, equipos o clasificación. ELO y MMR se muestran por separado.",
          },
          {
            title: "Dotabuff desde Steam",
            state: "implemented",
            text: "Tu enlace se construye desde tu cuenta Steam y está disponible para ti. Publicarlo es opcional y requiere activar su visibilidad al guardar. Los enlaces anteriores se conservan; una URL no significa que el perfil externo exista ni esté verificado.",
          },
          {
            title: "La primera partida real",
            state: "available",
            text: "Solo Mid 1v1 ha completado un recorrido humano real: confirmación de jugadores, lobby privado de Dota 2, invitaciones, inicio y resultado verificado. Esta prueba no certifica los demás modos.",
            href: "/partidas",
          },
          {
            title: "Historial y Match Studio",
            state: "available",
            text: "Detalles con participantes, héroes y estadísticas cuando existen datos verificados. Historial, perfil y resumen comparten información persistida; los datos ausentes se indican sin inventar cifras.",
          },
          {
            title: "Una experiencia más cómoda",
            state: "available",
            text: "Navegación adaptable a móvil, notificaciones, ajustes de sonidos y mejoras de foco, teclado y movimiento reducido. Los perfiles privados conservan su protección.",
          },
          {
            title: "Un lugar para seguir las novedades",
            state: "available",
            text: "Actualizaciones reúne mejoras, correcciones y próximos pasos. La cinta BETA identifica esta etapa de desarrollo sin cambiar cómo juegas.",
          },
        ],
      },
      {
        category: "improvements",
        items: [
          {
            title: "Historial competitivo del clan",
            state: "implemented",
            text: "Historial paginado y estadísticas de resultados 5v5 verificados cuando cinco integrantes representaban al clan en el mismo equipo al preparar la partida. Conserva la pertenencia histórica; excluye Solo Mid, intentos cancelados, plantillas incompletas y resultados sin verificar. Verificado en PostgreSQL y navegador aislados; pendiente de despliegue.",
          },
          {
            title: "Perfil competitivo con MMR",
            state: "activation",
            text: "Registro con Marci: nombre, país, región, rol principal, rol secundario opcional y MMR. Configuración incluye un apartado MMR independiente. La migración se aplicó con autorización el 21 de octubre de 2026; la disponibilidad pública del código actualizado sigue pendiente de comprobar.",
          },
          {
            title: "Una revisión Staff más clara",
            state: "implemented",
            text: "Resumen de declaraciones por estado, búsqueda, filtros y lista paginada. La ficha separa contexto competitivo, evidencia privada y decisiones auditadas; las aprobaciones mantienen los permisos existentes.",
          },
          {
            title: "MMR para preparar equipos",
            state: "activation",
            text: "Salas y balanceador resuelven el valor operativo en el servidor. Los intentos conservan una referencia congelada; verificar un jugador no mueve sus equipos ni altera ELO o XP.",
          },
          {
            title: "Partidas compactas y guía renovada",
            state: "implemented",
            text: "Resúmenes en una o dos columnas y carga progresiva para consultar varios encuentros. Ver partida conserva los diez jugadores y sus mini perfiles. La guía reutiliza Windranger y apunta al apartado MMR; no obliga a repetir un recorrido completado.",
          },
          {
            title: "Un podio con identidad competitiva",
            state: "implemented",
            text: "Trofeo dorado, plata y bronce con SVG nítidos, iluminación localizada y ajustes de nombres largos y móvil. El orden y el cálculo del ELO se conservan.",
            href: "/clasificacion",
          },
          {
            title: "Privacidad de sala, a tu alcance",
            state: "available",
            text: "Añade, cambia o retira la contraseña después de crear una sala, sin perder los equipos ni el chat. Confirmaciones claras, acceso protegido y validación del propietario.",
          },
          {
            title: "Staff reconocible en el chat",
            state: "implemented",
            text: "Owner, Admin, Mod y Helper tienen etiquetas legibles a la izquierda del nombre, obtenidas de autorizaciones vigentes del servidor. Las siglas del clan conservan su estilo secundario.",
          },
          {
            title: "Un centro de información compartido",
            state: "available",
            text: "Reglamento, preguntas frecuentes, borrador de términos y formulario de reportes organizados para facilitar la consulta. Los términos siguen pendientes de aprobación final.",
            href: "/reglas",
          },
          {
            title: "Organización de salas y capitanes",
            state: "activation",
            text: "Chat de sala, invitaciones, roles asignados, selección de capitanes, minijuegos y draft de jugadores están implementados y probados en aislamiento. Su recorrido completo se validará antes de anunciar disponibilidad pública.",
          },
          {
            title: "Cuidar nuestra comunidad",
            state: "activation",
            text: "Reportes con evidencias privadas, revisión por Staff, advertencias, sanciones y revocaciones con historial. Los flujos administrativos están probados; su disponibilidad pública se confirmará con el lanzamiento.",
          },
          {
            title: "Más formas de jugar",
            state: "activation",
            text: "All Pick, Captain’s Mode y Turbo tienen configuración de lobby, equipos y ReadyCheck implementados. Faltan recorridos humanos completos 5v5; el draft de jugadores no equivale al draft de héroes de Dota.",
          },
          {
            title: "Progresión competitiva",
            state: "activation",
            text: "Clasificación por ELO, XP, medallas y puntos virtuales con liquidación persistente. Las pruebas aisladas verifican 100 puntos por victoria elegible y 50 por derrota. Falta validar el ciclo humano 5v5; Solo Mid no otorga ELO, XP ni puntos competitivos.",
            href: "/clasificacion",
          },
          {
            title: "Pronósticos conectados a las partidas",
            state: "activation",
            text: "Elección única Radiant o Dire durante los primeros cinco minutos desde el inicio confirmado, historial y liquidación con resultado GC verificado. El flujo actual utiliza puntos virtuales y retorno ×1,80, con descuento y devolución por anulación; probado en un entorno controlado, pendiente de validación humana y confirmación de activación pública.",
            href: "/predicciones",
          },
          {
            title: "Bots y seguimiento de partidas",
            state: "activation",
            text: "Infraestructura de dos bots independientes, seguimiento de resultados y recuperación de capacidad implementados. La disponibilidad operativa de ambos y el ciclo simultáneo con jugadores deben comprobarse antes de la apertura.",
          },
        ],
      },
      {
        category: "fixes",
        items: [
          {
            title: "Borradores de intervención separados",
            state: "implemented",
            text: "El panel de Staff conserva temporalmente el motivo, la nota, el tipo y la duración al volver a un jugador o cambiar de módulo. Cada borrador pertenece al moderador y al jugador seleccionado; no se guarda en el navegador ni aplica una medida sin confirmar. Pendiente de despliegue.",
          },
          {
            title: "Preparación de tres bots independientes",
            state: "implemented",
            text: "Asistente local para una tercera cuenta Steam y administración por instancia, reutilizando reservas, supervisión y limpieza existentes. Asignación y recuperación comprobadas en aislamiento; alta operativa, Steam/GC y prueba humana 5v5 pendientes.",
          },
          {
            title: "Equilibrar por MMR más visible",
            state: "implemented",
            text: "La sala identifica el control de balanceo y explica sus bloqueos. Se conservan MMR aprobado o declarado, cinco jugadores por equipo y snapshots de Ready Check. Validación adicional frente a valores no positivos y jugadores duplicados, con pruebas SQL y de interfaz.",
          },
          {
            title: "MMR y revisión más claros",
            state: "implemented",
            text: "Campo MMR visible en el registro con Marci y nuevas declaraciones mayores que cero. Configuración compacta con solicitud de actualización en Dota 2 para jugadores verificados, selectores Staff accesibles y una única confirmación de aprobación o corrección. Se conservan auditoría, privacidad y valores históricos.",
          },
          {
            title: "Eliminación segura de cuentas",
            state: "implemented",
            text: "Los lobbies históricos cerrados y los intentos nunca enviados ya no bloquean por sí solos la eliminación. Los vínculos activos o inciertos mantienen la cuenta protegida y registran una solicitud de seguimiento, sin borrar resultados compartidos ni liberar bots.",
          },
          {
            title: "Revisión de MMR más clara",
            state: "implemented",
            text: "El panel Staff organiza filtros, MMR operativo, evidencia y decisiones en una ficha adaptable. La autorrevisión muestra un mensaje específico: Owner conserva la aprobación de otros jugadores, sin poder verificarse a sí mismo.",
          },
          {
            title: "Un historial de partidas disputadas",
            state: "testing",
            text: "Los intentos de lobby, Launch fallidos, cancelaciones y resultados sin verificar quedan fuera del historial normal, conservando sus registros para auditoría. Las partidas válidas anteriores mantienen su visibilidad.",
          },
          {
            title: "Duración de las partidas en vivo",
            state: "testing",
            text: "Las tarjetas cuentan minutos y segundos desde un inicio GC correlacionado, usando la hora del servidor. Si no hay una señal fiable, indican que la duración no está disponible; Launch o RUN observados por sí solos no inician el reloj.",
          },
          {
            title: "Dotabuff más sencillo",
            state: "implemented",
            text: "Enlace automático desde Steam y una opción compacta para publicarlo. La privacidad y los enlaces anteriores se conservan.",
          },
          {
            title: "Estadísticas que respetan cada modo",
            state: "available",
            text: "Solo Mid permanece en el historial sin alterar el ranking 5v5. La posición Mid procede de las reglas del modo; en otros modos no se inventa una posición cuando falta evidencia.",
          },
          {
            title: "Resultados sin suposiciones",
            state: "available",
            text: "La partida Solo Mid real permitió verificar ganador, duración y héroes mediante Dota GC. El sistema diferencia los resultados pendientes de los confirmados y protege las recompensas frente a repeticiones; la cobertura de estadísticas depende de cada partida.",
          },
        ],
      },
      {
        category: "stability",
        items: [
          {
            title: "Recuperación post-Launch bajo verificación",
            state: "testing",
            text: "Recuperación con POSTGAME, Match ID y resultado sin puntuación, más supervisión configurable que solicita comprobaciones ante falta de progreso. La capacidad se conserva hasta probar la salida externa. Se preparan nuevos intentos con confirmaciones humanas; no se repite un Launch ambiguo. Sin evidencia terminal se requiere reconciliación o intervención. Pendiente de pruebas reales y activación.",
          },
          {
            title: "Información pública y controles de acceso",
            state: "implemented",
            text: "Los perfiles privados y las insignias Staff mantienen validación de servidor. Las lecturas de mini perfiles reutilizan caché y solicitudes compartidas sin iniciar sincronizaciones externas.",
          },
          {
            title: "Sonidos sin duplicaciones al reconectar",
            state: "testing",
            text: "Se distingue una notificación nueva de una actualización acumulada. La reproducción respeta interacción del usuario, volumen, pestaña activa y restricciones del navegador; se valida con pruebas de reproducción y reconexión.",
          },
        ],
      },
      {
        category: "coming",
        items: [
          {
            title: "Próximamente — Tienda de Draftory",
            state: "development",
            text: "La sección visual ya puede visitarse. Estamos preparando futuras recompensas y opciones de personalización; todavía no hay productos, compras, canjes ni inventario disponibles.",
            href: "/tienda",
          },
          {
            title: "Apertura de la beta pública",
            state: "planned",
            text: "Confirmaremos la fecha, la disponibilidad de cada función y los próximos encuentros de validación antes de publicar esta versión.",
          },
        ],
      },
    ],
  },
]);
export function publishedChangelog(
  entries: readonly ChangelogEntry[] = changelogEntries,
) {
  return validateChangelog(entries)
    .filter(
      (
        e,
      ): e is ChangelogEntry & {
        status: "published";
        publishedAt: string;
        version: string;
      } => e.status === "published",
    )
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id),
    );
}
export function draftChangelog(
  entries: readonly ChangelogEntry[] = changelogEntries,
) {
  return validateChangelog(entries).filter((e) => e.status === "draft");
}
