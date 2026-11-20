/** Editorial content only. No section changes moderation or competitive policy. */
export const officialDiscord = "https://discord.gg/Aah2GJJ7Qs"; // Existing home + PublicFooter.
export type InformationSection = {
  id: string;
  title: string;
  intro: string;
  points?: string[];
  note?: string;
};
export const regulations: InformationSection[] = [
  {
    id: "principios",
    title: "Principios de nuestra comunidad",
    intro:
      "Draftory reúne a jugadores de Dota 2 en un entorno justo, respetuoso y competitivo. Las normas se aplican a salas, chats, partidas organizadas mediante la plataforma y canales comunitarios oficiales cuando corresponda.",
    points: [
      "La moderación considera contexto, pruebas, gravedad, intención y reincidencia.",
      "Una denuncia no constituye una prueba de culpabilidad ni provoca una sanción definitiva automática.",
      "Una mala partida, un error de ejecución o un desacuerdo estratégico no demuestran sabotaje.",
    ],
  },
  {
    id: "preparacion",
    title: "Antes de jugar",
    intro:
      "Entra a una sala cuando puedas dedicar tiempo a preparar y disputar el encuentro.",
    points: [
      "Activa en Dota 2 la opción de exponer públicamente los datos de tus partidas. Su disponibilidad depende también de la cobertura y los tiempos de los proveedores: hacerlos públicos no garantiza una actualización inmediata.",
      "Declara tu MMR con veracidad. El dato puede aparecer sin validar o como declarado hasta que el procedimiento de revisión confirme información verificable. El staff puede contrastarla con pruebas y rendimiento observado; el MMR no es el ELO de Draftory.",
      "Desde la selección de capitanes hasta el final, respeta el compromiso con los demás y comunica cualquier impedimento.",
      "Salir de una sala, perder conexión y abandonar una partida iniciada son situaciones distintas y requieren valorar sus circunstancias.",
    ],
    note: "Criterio propuesto, pendiente de aprobación: ante una salida injustificada de una sala completa, advertencia o hasta una hora de restricción competitiva. La reincidencia exige revisión humana; no se activa un castigo automático.",
  },
  {
    id: "equipos",
    title: "Salas, equipos y capitanes",
    intro:
      "Respeta el modo y las condiciones acordadas en la sala. Los roles preferidos orientan la organización, pero no garantizan una posición en todas las partidas.",
    points: [
      "Los capitanes deben actuar de buena fe; no sabotees la elección de equipos ni el draft.",
      "Cumple el rol asignado o acuerda un cambio con tu equipo.",
      "Utiliza tu propia cuenta. No suplantes jugadores ni compartas cuentas para eludir controles.",
      "El creador organiza la sala y puede reportar incidencias. No adquiere por ello facultad para sancionar ni alterar resultados oficiales.",
      "La preparación puede incluir capitanes, selección de equipos y Ready Check. Un lobby o una invitación no equivalen a una confirmación de inicio.",
    ],
  },
  {
    id: "conducta",
    title: "Conducta y respeto",
    intro:
      "Competir con intensidad no justifica perjudicar o acosar a otras personas.",
    points: [
      "No se permiten insultos, burlas persistentes, amenazas, acoso ni discriminación por raza, género, origen, religión, orientación sexual u otra condición.",
      "Se prohíben anuncios deliberados de sabotaje, como «te voy a feedear» o «ya fue, pierde», morir intencionalmente para perjudicar y negarse deliberadamente a colaborar.",
      "No ignores de forma intencional las responsabilidades acordadas ni manipules el MMR o los resultados. Un mal rendimiento por sí solo no acredita intención.",
      "No utilices trampas, herramientas no autorizadas ni errores técnicos para obtener ventajas.",
      "No publiques datos personales ajenos: teléfonos, direcciones, ubicaciones o fotografías privadas. El doxing malicioso es extremadamente grave y puede justificar una suspensión permanente tras investigación.",
      "Evita nombres, avatares y mensajes ofensivos, spam y autopromoción no autorizada. Estas reglas alcanzan los canales oficiales de la comunidad.",
    ],
  },
  {
    id: "desconexiones",
    title: "Desconexiones y abandonos",
    intro:
      "Comunica los problemas técnicos cuando sea posible. La pérdida temporal de conexión no equivale a un abandono voluntario.",
    points: [
      "Como pauta de cortesía propuesta, el creador puede conceder hasta dos minutos para intentar el regreso, según la fase y las posibilidades del juego.",
      "Draftory no promete pausar automáticamente Dota 2 ni ofrece un temporizador de tolerancia obligatorio. No fuerces una pausa o un cierre que el juego no permita.",
      "Si alguien abandona definitivamente, registra los hechos y repórtalos. El staff debe contrastar la evidencia y valorar fallos del bot, del servidor o de la conexión.",
      "La reincidencia puede motivar medidas mayores; los fallos técnicos comprobables pueden ser atenuantes.",
    ],
    note: "Propuesta pendiente de aprobación: 24 horas de restricción competitiva para un abandono definitivo confirmado. No se aplica a una simple desconexión ni se ejecuta automáticamente.",
  },
  {
    id: "remake",
    title: "Remake (RMK)",
    intro:
      "RMK significa remake: recrear una partida desde cero cuando una incidencia verificable impide iniciarla o desarrollarla correctamente.",
    points: [
      "Puede solicitarse por un jugador que no consigue entrar al lobby, un fallo técnico importante antes del inicio o una configuración distinta de la acordada.",
      "Un draft desfavorable o el deseo de evitar una derrota no justifican un RMK.",
      "Si ya existe una partida oficial en curso, cualquier intervención debe respetar las posibilidades de Dota 2 y la verificación de resultados de Draftory.",
      "El creador puede comunicar el incidente; no puede reescribir arbitrariamente un resultado.",
    ],
    note: "No existe un flujo general de RMK automático. Solicítalo para revisión manual por soporte. La votación para cancelar ciertos intentos antes del inicio es una función distinta: actualmente requiere 8 votos en 5v5 o 2 en Solo Mid, y solo aparece en las fases admitidas.",
  },
  {
    id: "integridad",
    title: "Integridad competitiva",
    intro:
      "Los resultados y la progresión deben reflejar partidas legítimas y verificadas.",
    points: [
      "No acuerdes derrotas, coordines resultados falsos ni presentes pruebas manipuladas.",
      "El resultado oficial requiere correlación y verificación; la ausencia de estadísticas no autoriza a inventar un ganador.",
      "No pueden exigirse recompensas por resultados pendientes o no verificables. ELO, XP y puntos siguen las reglas de elegibilidad del servidor.",
      "Solo Mid conserva su historial, pero no modifica la clasificación ni las recompensas competitivas 5v5.",
      "El MMR de Dota 2, el ELO de Draftory y los puntos virtuales son conceptos diferentes.",
    ],
  },
  {
    id: "reportes",
    title: "Reportes y evidencias",
    intro:
      "Utiliza el acceso «Reportar un jugador» de este centro o el disponible en un perfil. El formulario existente solicita una identidad Draftory, categoría, asunto, descripción y evidencias.",
    points: [
      "Explica los hechos de forma concreta e identifica al jugador, la sala o el Match ID cuando corresponda.",
      "Aporta capturas, mensajes, enlaces y otros registros pertinentes. Evita incluir datos privados innecesarios.",
      "Las imágenes de evidencia dependen de que el almacenamiento privado esté habilitado; los enlaces y la explicación siguen disponibles.",
      "Las acusaciones deliberadamente falsas, las pruebas manipuladas y el uso del reporte para hostigar también pueden ser revisados y sancionados.",
      "Una denuncia de buena fe que no pueda demostrarse no se considera automáticamente falsa. El staff autorizado revisa cada caso.",
    ],
  },
  {
    id: "sanciones",
    title: "Medidas y proporcionalidad",
    intro:
      "Solo el staff autorizado puede aplicar medidas. El sistema admite advertencia, silencio temporal, suspensión temporal y suspensión permanente. La tabla muestra su alcance actual.",
    points: [
      "Una infracción leve por desconocimiento puede motivar una advertencia.",
      "La conducta ofensiva reiterada puede motivar silencio o suspensión temporal, según las pruebas y la gravedad.",
      "El sabotaje o fraude deliberado puede requerir medidas mayores tras investigación. El doxing grave puede justificar suspensión permanente.",
      "Las propuestas de una hora o 24 horas son criterios editoriales pendientes de aprobación, no un baremo automático.",
      "Las sanciones pueden revocarse y las restricciones temporales dejan de aplicarse al vencer. Los registros y la trazabilidad se conservan.",
    ],
    note: "No existe un tipo independiente de «restricción solo de salas», silencio permanente o desactivación administrativa de cuenta. No se presentan como acciones disponibles. La suspensión competitiva existente tiene un alcance mayor que impedir únicamente entrar a una sala.",
  },
  {
    id: "apelaciones",
    title: "Apelaciones y soporte",
    intro:
      "Si consideras que una sanción o acusación es incorrecta, solicita una revisión mediante el Discord oficial enlazado en este centro.",
    points: [
      "Incluye tu DF-ID, la sanción recibida, el motivo de la apelación y las evidencias o explicaciones relevantes.",
      "Procedimiento propuesto: abrir un ticket en el Discord oficial, cuando el equipo haya habilitado ese canal. No existe un portal de apelaciones integrado en Draftory.",
      "No se garantiza un plazo de respuesta. El equipo debe revisar el contexto y explicar las decisiones pertinentes.",
      "Informa también de problemas técnicos o accesos no autorizados por los canales oficiales. Nunca compartas contraseñas, tokens ni códigos Steam Guard.",
    ],
  },
];
export const sanctionRows = [
  {
    kind: "WARNING",
    effect:
      "Aviso formal. No restringe por sí mismo la participación ni el chat.",
    duration: "Sin castigo asociado; conserva historial.",
  },
  {
    kind: "MUTE",
    effect: "Restringe el chat de sala durante su vigencia.",
    duration: "Temporal, según la decisión autorizada.",
  },
  {
    kind: "SUSPENSION",
    effect:
      "Impide acciones competitivas: crear o entrar a salas, confirmar preparación, ejercer acciones de capitán e iniciar partidas. También impide el chat de sala. No es un bloqueo total de la cuenta.",
    duration:
      "Entre 1 minuto y 366 días; el rol de moderador tiene un máximo de 7 días.",
  },
  {
    kind: "PERMANENT",
    effect:
      "Mantiene las restricciones competitivas y de chat sin vencimiento. Requiere autorización específica y admite revocación.",
    duration: "Sin vencimiento hasta revisión o revocación.",
  },
] as const;
export const terms: InformationSection[] = [
  {
    id: "operador",
    title: "1. Quiénes somos",
    intro:
      "Draftory es una plataforma comunitaria independiente dedicada a organizar experiencias competitivas de Dota 2. No es Valve, Steam ni Dota 2, y no afirma una afiliación oficial con esas entidades.",
    note: "La identidad legal, jurisdicción y datos de contacto del operador deben completarse y aprobarse antes de publicar estos términos como definitivos.",
  },
  {
    id: "aceptacion",
    title: "2. Alcance y aceptación",
    intro:
      "El uso de Draftory está sujeto al reglamento y a las condiciones y políticas de privacidad que apruebe y comunique su operador. Este borrador no establece una aceptación contractual retroactiva ni añade un mecanismo de aceptación al inicio de sesión.",
  },
  {
    id: "requisitos",
    title: "3. Requisitos de uso",
    intro:
      "Utiliza una cuenta legítima y los mecanismos autorizados de vinculación, proporciona información veraz y cumple las normas aplicables de Steam y Dota 2. Debes contar con la edad y capacidad necesarias conforme a las normas que resulten aplicables.",
    note: "No se afirma una edad mínima concreta ni una verificación de edad. La protección de menores requiere revisión antes de la publicación definitiva.",
  },
  {
    id: "seguridad",
    title: "4. Cuentas y seguridad",
    intro:
      "Protege tu acceso y no compartas credenciales ni suplantes identidades. Comunica los accesos no autorizados por soporte oficial. Draftory no necesita que envíes tu contraseña de Steam o códigos de seguridad por chat.",
  },
  {
    id: "servicios",
    title: "5. Servicios y fase beta",
    intro:
      "La plataforma implementa salas, organización de partidas, perfiles, clanes, clasificación, estadísticas y herramientas comunitarias. Su disponibilidad concreta depende de los controles operativos y del estado de cada servicio.",
    points: [
      "Las funciones beta pueden cambiar y presentar fallos.",
      "La tienda es una presentación de próximas funciones, no un catálogo de compras habilitado.",
      "Las herramientas de bots y resultados dependen de servicios externos y de verificaciones; este texto no certifica la disponibilidad de un bot ni de todos los modos en producción.",
    ],
  },
  {
    id: "datos",
    title: "6. Estadísticas y resultados",
    intro:
      "Los proveedores externos pueden tardar en actualizar datos o no cubrir una partida. El resultado oficial depende de su verificación y no de la mera declaración de un participante. El MMR de Dota 2 no equivale al ELO de Draftory. Los errores y discrepancias se revisan mediante los procedimientos existentes.",
  },
  {
    id: "contenido",
    title: "7. Contenido de usuarios",
    intro:
      "Publica únicamente nombres, avatares, escudos, biografías, mensajes y evidencias que tengas derecho a utilizar. Se prohíbe contenido ilícito, abusivo, engañoso o que vulnere derechos de terceros. No difundas información privada de otras personas.",
  },
  {
    id: "moderacion",
    title: "8. Moderación y revisión",
    intro:
      "El personal autorizado puede revisar reportes y aplicar las medidas existentes de forma proporcional, considerando evidencias y contexto. El afectado puede solicitar revisión por los canales oficiales. No se promete un plazo de resolución ni una sanción automática por cada reporte.",
  },
  {
    id: "disponibilidad",
    title: "9. Disponibilidad y cambios",
    intro:
      "Puede haber mantenimiento, interrupciones o modificaciones de funciones. No se garantiza disponibilidad continua ni acceso permanente a una función beta. Los cambios relevantes deben comunicarse con información suficiente para la comunidad.",
  },
  {
    id: "privacidad",
    title: "10. Privacidad",
    intro:
      "Draftory trata datos de cuenta y actividad necesarios para prestar sus funciones. Las preferencias de visibilidad existentes controlan parte de la información pública.",
    note: "Pendiente legal antes de publicar: una Política de Privacidad completa, identificación del responsable, bases y finalidades del tratamiento, conservación, destinatarios y ejercicio de derechos conforme al marco aplicable. No se inventan aquí plazos o garantías técnicas que no estén verificados.",
  },
  {
    id: "propiedad",
    title: "11. Propiedad intelectual",
    intro:
      "Los elementos propios de Draftory se distinguen de las marcas, imágenes y materiales de terceros, que pertenecen a sus titulares. El acceso al servicio no concede derechos sobre esas marcas. Los usuarios deben respetar las licencias y derechos de los contenidos que comparten.",
  },
  {
    id: "responsabilidad",
    title: "12. Responsabilidad",
    intro:
      "Las incidencias pueden depender del juego, proveedores o conexiones externas. La valoración de cualquier responsabilidad debe atender al servicio efectivamente prestado y a la legislación aplicable. Ninguna cláusula de este borrador pretende excluir derechos irrenunciables ni responsabilidades que legalmente no puedan limitarse.",
  },
  {
    id: "cambios",
    title: "13. Modificación de los términos",
    intro:
      "El operador debe comunicar adecuadamente las modificaciones importantes e indicar la versión y vigencia aprobadas. Los textos en preparación no sustituyen silenciosamente unas condiciones previamente aceptadas.",
  },
  {
    id: "contacto",
    title: "14. Contacto y soporte",
    intro:
      "Utiliza el Discord oficial de Draftory enlazado en este centro. No se designan una empresa, domicilio, representante o dirección de correo que no estén documentados. Evita transmitir información sensible por canales públicos.",
  },
  {
    id: "vigencia",
    title: "15. Fecha de vigencia",
    intro:
      "Borrador sin fecha de vigencia. Pendiente de revisión legal y aprobación expresa del propietario. Su preparación no confirma un lanzamiento ni un despliegue de la beta pública.",
  },
];
export const faq = [
  {
    id: "general",
    title: "Funcionamiento general",
    items: [
      [
        "¿Qué es Draftory?",
        "Una comunidad competitiva de Dota 2 para organizar salas, jugar con otros participantes y consultar perfiles, estadísticas y una clasificación propia.",
      ],
      [
        "¿Cómo puedo jugar?",
        "Inicia sesión, completa tu perfil y tus datos de Dota 2, crea una sala o entra en una disponible y sigue las fases de equipos y preparación. La disponibilidad de bots y servicios puede afectar al inicio.",
      ],
      [
        "¿Necesito Dota 2 instalado?",
        "Sí. Para disputar las partidas necesitas Dota 2 y cumplir los requisitos y normas del juego.",
      ],
      [
        "¿Dónde reporto a un jugador?",
        "Usa el botón de reporte de este centro o el acceso de su perfil, cuando esté disponible. Introduce su DF-ID, explica los hechos y añade evidencias.",
      ],
      [
        "¿Dónde comunico un problema técnico o apelo?",
        "En el Discord oficial. Para una apelación aporta tu DF-ID, sanción, motivo y pruebas. El ticket es un procedimiento propuesto sujeto a los canales que habilite el equipo; no hay portal integrado ni plazo garantizado.",
      ],
    ],
  },
  {
    id: "salas",
    title: "Salas y partidas",
    items: [
      [
        "¿Cómo creo una sala?",
        "Desde Salas, selecciona Crear sala y completa modo, región y acceso. Necesitas sesión, perfil preparado y no tener una restricción competitiva activa o una participación incompatible.",
      ],
      [
        "¿Puedo proteger una sala ya creada?",
        "El propietario puede añadir, cambiar o quitar su contraseña desde Configuración de sala → Privacidad y acceso. Los miembros que ya están dentro conservan su acceso.",
      ],
      [
        "¿Qué sucede cuando se completa una sala?",
        "Se organizan equipos y, según el modo, capitanes y selección. Ready Check requiere la confirmación de los participantes. Después deben verificarse el lobby, los jugadores y el inicio; una sala llena no inicia por sí sola Dota 2.",
      ],
      [
        "¿Puedo abandonar una sala?",
        "Utiliza la salida disponible antes de comprometerte con una partida. Una salida injustificada durante una fase comprometida puede reportarse; el staff valora el contexto. No hay sanción automática por una desconexión.",
      ],
      [
        "¿Qué significa RMK y cuándo se solicita?",
        "Remake: recrear una partida por una incidencia técnica o de configuración verificable, no por un draft desfavorable o para evitar una derrota. No hay botón general de RMK: requiere revisión manual.",
      ],
      [
        "¿Qué diferencia hay entre cancelar y hacer un RMK?",
        "La cancelación por votos existe para determinados intentos antes de su inicio: 8 votos en 5v5 y 2 en Solo Mid. No sustituye una revisión de una partida oficial en curso ni altera resultados verificados.",
      ],
      [
        "¿Qué pasa ante un abandono definitivo?",
        "Repórtalo con evidencias. Las 24 horas de restricción son una propuesta de revisión, pendiente de aprobación, no una penalización automática ni una regla ya ejecutada por el servidor.",
      ],
      [
        "¿Y si alguien pierde conexión?",
        "Como pauta propuesta puede concederse hasta dos minutos cuando el juego lo permita. No hay pausa automática ni temporizador obligatorio de Draftory; deben distinguirse una incidencia y un abandono deliberado.",
      ],
      [
        "¿Qué hago si el bot no invita?",
        "Revisa el estado y las indicaciones de la sala. Si el intento admite cancelación, utiliza su votación; de lo contrario comunica el problema a soporte con la sala y Match ID si existe. No lances otra partida ni reinicies el bot por tu cuenta. No se garantiza una recuperación automática de cualquier incidencia.",
      ],
    ],
  },
  {
    id: "estadisticas",
    title: "Clasificación y estadísticas",
    items: [
      [
        "¿MMR y ELO son lo mismo?",
        "No. MMR corresponde a Dota 2 y ELO a la clasificación propia de Draftory. Los puntos y la XP son progresiones distintas.",
      ],
      [
        "¿Por qué mi MMR está sin validar?",
        "Puede ser un dato declarado pendiente de contraste. No se presenta como una verificación externa en tiempo real. Aporta información verificable si el staff solicita una revisión.",
      ],
      [
        "¿Por qué no aparecen mis estadísticas?",
        "Puede deberse a privacidad, retrasos o falta de cobertura del proveedor, o a que todavía no haya partidas verificadas. Activa la exposición pública de datos en Dota 2; eso no garantiza disponibilidad inmediata.",
      ],
      [
        "¿Todas las partidas cuentan para el ranking?",
        "Solo las partidas elegibles con resultado verificado y progresión liquidada. Las políticas actuales contemplan los modos 5v5 All Pick, Captain’s Mode y Turbo; Solo Mid mantiene historial sin sumar ELO, XP ni puntos competitivos. Que un modo esté implementado no prueba su disponibilidad operativa en este instante.",
      ],
    ],
  },
  {
    id: "clanes",
    title: "Clanes",
    items: [
      [
        "¿Qué es un clan?",
        "Un equipo de Draftory con nombre, escudo y siglas, integrado en las identidades y mini perfiles de sus jugadores.",
      ],
      [
        "¿Cuántos integrantes admite?",
        "Hasta diez, incluido el líder. No puede aceptarse un undécimo miembro.",
      ],
      [
        "¿Puedo pertenecer a varios?",
        "Solo puedes pertenecer a un clan activo a la vez. El líder debe transferir el liderazgo o disolverlo antes de salir.",
      ],
      [
        "¿Cómo invito a un jugador?",
        "El líder y los oficiales pueden buscar su identidad pública por DF-ID y enviar una invitación. El destinatario debe aceptarla y seguir siendo elegible.",
      ],
      [
        "¿Puedo editar nombre, siglas y escudo?",
        "El líder puede hacerlo desde General en la configuración del clan. Las siglas tienen un máximo de seis caracteres y no cambian el nombre original del jugador.",
      ],
    ],
  },
  {
    id: "cuenta",
    title: "Cuenta y seguridad",
    items: [
      [
        "¿Cómo cambio mi foto o nombre?",
        "Desde Configuración. Cambiar foto conserva el recorte y las validaciones; restaurar el avatar de Steam está disponible cuando utilizas una imagen personalizada.",
      ],
      [
        "¿Cómo añado redes sociales?",
        "Desde la sección de redes del perfil. Solo se muestran los enlaces públicos admitidos. Un enlace escrito manualmente no equivale a una cuenta autenticada o verificada.",
      ],
      [
        "¿Cómo funcionan los mini perfiles?",
        "Se abren al interactuar con avatares compatibles mediante cursor, teclado o tacto. Utilizan información almacenada y autorizada; no sincronizan proveedores externos en cada apertura.",
      ],
      [
        "¿Qué hago ante una sanción injusta?",
        "Consulta el motivo y las fechas de la notificación y solicita revisión por soporte oficial. Aporta contexto; no envíes datos privados en canales públicos.",
      ],
      [
        "¿Por qué no suenan las notificaciones?",
        "Comprueba Sonidos en Configuración, el volumen, la interacción previa que exige el navegador y que la pestaña esté visible. Probar sonido permite comprobar un intento real. Una notificación antigua o duplicada no debe sonar otra vez.",
      ],
    ],
  },
] as const;
