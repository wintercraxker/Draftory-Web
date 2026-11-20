export const tourImage = "/wind_guia.png" as const;
export const tourVersion = 2;
type TourStep = {
  id: string;
  title: string;
  image: typeof tourImage;
  description: string;
  route?: string;
};
export const tourSteps: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Tu equipo empieza aquí",
    image: tourImage,
    description:
      "Bienvenido a Draftory. Organiza encuentros de Dota 2, conoce jugadores y construye tu recorrido competitivo. Windranger te acompaña en este recorrido breve.",
  },
  {
    id: "competitive-mmr",
    route: "/configuracion?tab=mmr",
    title: "Tu perfil y tu MMR",
    image: tourImage,
    description:
      "Tu nombre y tus roles forman tu identidad. Declara tu MMR actual: se utiliza provisionalmente para equilibrar salas. Staff puede acreditarlo; solo el valor aprobado pasa a ser operativo. El ELO de Draftory es independiente.",
  },
  {
    id: "dashboard-rooms",
    route: "/salas",
    title: "Encuentra tu próxima partida",
    image: tourImage,
    description:
      "Crea una sala o entra en una pública o protegida. El banco, Radiant y Dire permiten organizar diez jugadores. El creador puede analizar el balance por MMR; los cambios de equipos requieren su confirmación.",
  },
  {
    id: "dashboard-rooms",
    route: "/salas",
    title: "Del check-in al lobby de Dota",
    image: tourImage,
    description:
      "Los diez jugadores confirman el check-in. Cuando hay un bot disponible, llegan las invitaciones al lobby privado de Dota 2. Acepta y ocupa el equipo asignado. El Launch se ejecuta mediante las autorizaciones de ese intento.",
  },
  {
    id: "dashboard-matches",
    route: "/partidas",
    title: "Launch, fallos de carga y RMK",
    image: tourImage,
    description:
      "Launch enviado no significa partida iniciada. Si alguien no carga, espera la reconciliación: la recuperación necesita confirmación terminal y limpieza externa. Cuando el intento queda cerrado, un RMK seguro exige nuevas confirmaciones; nunca duplica un Launch incierto.",
  },
  {
    id: "dashboard-matches",
    route: "/partidas",
    title: "En vivo e historial",
    image: tourImage,
    description:
      "En vivo muestra el seguimiento y, si GC comunica un inicio fiable, la duración. El historial incluye resultados válidos y verificados. Intentos fallidos, cancelaciones sin jugar y NotScored no cuentan como partidas disputadas.",
  },
  {
    id: "dashboard-ranking",
    route: "/clasificacion",
    title: "Tu progreso en Draftory",
    image: tourImage,
    description:
      "El ELO, XP y reconocimientos proceden de resultados elegibles de Draftory. La clasificación ordena ese ELO; no representa el MMR de Dota ni el Top Inmortal. Las estadísticas competitivas 5v5 no mezclan Solo Mid.",
  },
  {
    id: "dashboard-clan",
    route: "/clan",
    title: "Construye tu identidad de equipo",
    image: tourImage,
    description:
      "Crea un clan, explora equipos y gestiona invitaciones. Hasta diez integrantes comparten escudo y siglas. Los mini perfiles permiten conocer jugadores sin salir de la página.",
  },
  {
    id: "dashboard-predictions",
    route: "/predicciones",
    title: "Comunidad y próximas recompensas",
    image: tourImage,
    description:
      "Consulta Predicciones cuando haya partidas elegibles y revisa sus reglas. Los puntos son virtuales. Tienda está en desarrollo; no hay compras ni canjes disponibles.",
  },
  {
    id: "competitive-mmr",
    route: "/configuracion?tab=mmr",
    title: "Tu cuenta, a tu manera",
    image: tourImage,
    description:
      "Desde el menú de cuenta inferior puedes abrir tu perfil y Configuración: avatar, roles, MMR, redes públicas y privacidad. Un jugador verificado solicita una actualización sin sobrescribir el valor aprobado. Puedes repetir la guía aquí cuando quieras.",
  },
  {
    id: "dashboard-rules",
    route: "/reglas",
    title: "Reglas, ayuda y comunidad",
    image: tourImage,
    description:
      "El centro de información reúne reglas, ayuda y preguntas frecuentes. Utiliza los reportes para situaciones concretas: Staff revisa cada caso. La campana muestra notificaciones y Actualizaciones reúne las novedades.",
  },
  {
    id: "done",
    title: "Nos vemos en Draftory",
    image: tourImage,
    description:
      "Ya conoces el recorrido. Puedes omitir o repetir esta guía sin cambiar tu cuenta, tus datos competitivos ni tu progreso.",
  },
];
export function validTourStep(step: number) {
  return Number.isInteger(step) && step >= 0 && step < tourSteps.length;
}
