// Public vocabulary only. Raw adapter output and credentials never enter this catalog.
export const botActions = {
  RECONNECT: "Solicitar reconexión",
  RESTART: "Reiniciar de forma controlada",
  RELEASE_EXPIRED: "Revisar reservas vencidas",
  RECOVER: "Solicitar recuperación segura",
  DRAIN: "Retirar de servicio",
} as const;
export type BotAction = keyof typeof botActions;
export const botEvents: Record<
  string,
  { title: string; explanation: string; solution: string; category: string }
> = {
  AGENT_CONNECTED: {
    title: "Agente conectado",
    explanation: "El agente Windows autenticó su identidad exclusiva.",
    solution:
      "Comprueba también Steam y GC; el agente no demuestra disponibilidad competitiva.",
    category: "conexion",
  },
  STEAM_CONNECTED: {
    title: "Steam conectado",
    explanation: "El adaptador confirmó una sesión Steam.",
    solution: "Espera la confirmación del Game Coordinator.",
    category: "steam",
  },
  STEAM_DISCONNECTED: {
    title: "Steam desconectado",
    explanation: "La sesión Steam dejó de estar disponible.",
    solution: "Revisa la conectividad antes de solicitar una reconexión.",
    category: "steam",
  },
  GC_CONNECTED: {
    title: "Dota GC conectado",
    explanation: "El adaptador recibió la bienvenida del Game Coordinator.",
    solution: "La disponibilidad exige además reconciliación y salud reciente.",
    category: "gc",
  },
  GC_DISCONNECTED: {
    title: "Dota GC desconectado",
    explanation: "No existe una conexión GC confirmada.",
    solution: "Mantén protegido cualquier intento incierto y revisa la red.",
    category: "gc",
  },
  AUTH_REJECTED: {
    title: "Autenticación rechazada",
    explanation: "Steam rechazó la sesión existente.",
    solution:
      "La reautenticación requiere intervención local autorizada; no se cambia el token automáticamente.",
    category: "autenticacion",
  },
  JOB_ASSIGNED: {
    title: "Trabajo asignado",
    explanation: "El worker recibió una reserva con lease y fencing.",
    solution: "Consulta el progreso sin liberar reservas activas.",
    category: "asignacion",
  },
  LOBBY_CREATED: {
    title: "Lobby confirmado",
    explanation: "El adaptador confirmó la creación del lobby.",
    solution: "Consulta los jugadores y el Ready Check.",
    category: "lobby",
  },
  INVITATIONS_SENT: {
    title: "Invitaciones enviadas",
    explanation: "El adaptador confirmó el envío de invitaciones.",
    solution: "Comprueba que los jugadores acepten desde Dota 2.",
    category: "invitaciones",
  },
  PLAYERS_UPDATED: {
    title: "Jugadores actualizados",
    explanation: "Se recibió una observación del roster del lobby.",
    solution: "No utilices abandonos como prueba de finalización.",
    category: "jugadores",
  },
  READY_UPDATED: {
    title: "Ready Check actualizado",
    explanation: "Cambió el estado de confirmaciones.",
    solution:
      "Respeta las confirmaciones requeridas antes de preparar la partida.",
    category: "ready",
  },
  LAUNCH_OBSERVED: {
    title: "Launch observado",
    explanation:
      "Existe una observación de Launch; no demuestra por sí sola que la partida comenzó.",
    solution: "Espera una señal de inicio confirmada.",
    category: "launch",
  },
  RECOVERY_REQUIRED: {
    title: "Recuperación pendiente",
    explanation: "El estado necesita reconciliación con evidencia externa.",
    solution:
      "No liberes el bot mediante SQL ni asumas que un timeout termina una partida.",
    category: "recuperacion",
  },
  TIMEOUT: {
    title: "Tiempo de espera agotado",
    explanation: "No llegó una confirmación dentro del plazo.",
    solution:
      "Comprueba el estado real antes de reintentar; no se repite automáticamente una acción incierta.",
    category: "timeout",
  },
  SESSION_CLOSED: {
    title: "Sesión cerrada",
    explanation: "El adaptador confirmó el cierre.",
    solution:
      "Verifica también la limpieza terminal antes de reutilizar capacidad.",
    category: "cierre",
  },
  COMMAND_REQUESTED: {
    title: "Acción solicitada",
    explanation:
      "Staff registró una solicitud; Windows todavía no ha confirmado su ejecución.",
    solution: "Espera el recibo del agente.",
    category: "administracion",
  },
  COMMAND_RECEIVED: {
    title: "Acción recibida",
    explanation: "El agente reclamó exclusivamente esta solicitud.",
    solution: "Espera las comprobaciones locales.",
    category: "administracion",
  },
  COMMAND_EXECUTING: {
    title: "Acción en ejecución",
    explanation: "El agente inició una operación permitida localmente.",
    solution: "No envíes otra acción mientras su resultado sea incierto.",
    category: "administracion",
  },
  COMMAND_SUCCEEDED: {
    title: "Acción confirmada",
    explanation: "El agente devolvió un resultado confirmado.",
    solution:
      "Revisa el estado de salud resultante; no implica disponibilidad competitiva.",
    category: "administracion",
  },
  COMMAND_FAILED: {
    title: "Acción no completada",
    explanation: "El agente rechazó o no pudo confirmar la operación.",
    solution:
      "Consulta el código de diagnóstico. No fuerces locks ni reinicios.",
    category: "administracion",
  },
};
export const botCommandStatuses: Record<string, string> = {
  REQUESTED: "Solicitada",
  RECEIVED: "Recibida",
  EXECUTING: "En ejecución",
  SUCCEEDED: "Confirmada",
  FAILED: "Fallida",
  EXPIRED: "Caducada sin confirmar",
};
export const botResultLabels: Record<string, string> = {
  CONFIRMED: "Resultado confirmado por Windows",
  LOCAL_CAPABILITY_DISABLED: "Función local no habilitada",
  BUSY_OR_UNCERTAIN: "Intento activo o estado incierto: protegido",
  CONNECTION_LOST: "Se perdió la conexión; requiere comprobación",
  TIMEOUT: "Sin confirmación dentro del plazo",
  EXECUTION_FAILED: "Windows no pudo confirmar la operación",
};
