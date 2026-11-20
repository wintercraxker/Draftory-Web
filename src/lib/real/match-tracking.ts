import { gameplayConfirmed } from "../dota-start-evidence";
export type MatchTracking = {
  activity: "PREPARING" | "CONFIRMED" | "UNKNOWN" | "ENDED";
  result: "PENDING" | "VERIFIED" | "UNVERIFIED" | "CANCELLED";
  label: string;
  externalMatchId: string | null;
  timeline: {
    label: string;
    at: string;
    source: "DRAFTORY" | "GC" | "PROVIDER";
  }[];
};
// Read projection, separate from the competitive state. Staleness can invalidate
// an 'En vivo' claim, but can never prove a finish, abort, winner or reward.
export function matchTracking(
  input: {
    status: string;
    verifiedAt: Date | null;
    dotaMatchId: string | null;
    createdAt: Date;
    finishedAt: Date | null;
    startedAt: Date | null;
    roomCreatedAt?: Date;
    readyCheck?: { startedAt: Date; completedAt: Date | null } | null;
    lobby: {
      state: string;
      gcConfirmedAt: Date | null;
      lastObservedAt: Date | null;
    } | null;
    control: {
      status: string;
      externalMatchId?: string | null;
      consumedAt: Date | null;
      startedObservedAt: Date | null;
      warningJournal: unknown;
    } | null;
    cache: { normalized: unknown } | null;
  },
  now = Date.now(),
): MatchTracking {
  const journal = input.control?.warningJournal as {
    LIFECYCLE?: {
      source?: string;
      state?: string;
      postgameAt?: string;
      lastSeenAt?: string;
      externalMatchId?: string;
    };
    GC_DETAILS?: {
      code?: string;
      externalMatchId?: string;
      obtainedAt?: string;
      snapshot?: { match_id?: string; match_outcome?: number };
    };
  } | null;
  const lifecycle = journal?.LIFECYCLE;
  const r = input.cache?.normalized as {
    reconciliation?: { exhausted?: boolean };
  } | null;
  const started =
    !!input.control?.startedObservedAt && input.control.status === "STARTED";
  const verified = input.status === "COMPLETED" && !!input.verifiedAt;
  const postgame =
    lifecycle?.state === "POSTGAME" &&
    lifecycle.source === "GC" &&
    lifecycle.externalMatchId === input.dotaMatchId &&
    !!input.control?.consumedAt &&
    Date.parse(lifecycle.postgameAt ?? "") >=
      input.control.consumedAt.getTime() &&
    Date.parse(lifecycle.postgameAt ?? "") <= now &&
    Number.isFinite(Date.parse(lifecycle.postgameAt ?? ""));
  const gc = journal?.GC_DETAILS;
  const gcTerminal =
    started &&
    gc?.externalMatchId === input.dotaMatchId &&
    gc.snapshot?.match_id === input.dotaMatchId &&
    ["AVAILABLE", "PARTIAL"].includes(gc.code ?? "") &&
    [2, 3, 4, 5, 64, 65, 66, 67, 68, 69].includes(
      gc.snapshot?.match_outcome ?? -1,
    ) &&
    Number.isFinite(Date.parse(gc.obtainedAt ?? "")) &&
    Date.parse(gc.obtainedAt!) >= input.control!.startedObservedAt!.getTime() &&
    Date.parse(gc.obtainedAt!) <= now;
  const fresh =
    input.lobby?.state === "CONFIRMED" &&
    !!input.lobby.lastObservedAt &&
    now - input.lobby.lastObservedAt.getTime() >= 0 &&
    now - input.lobby.lastObservedAt.getTime() < 30000;
  const activity =
    verified || postgame || gcTerminal
      ? "ENDED"
      : started
        ? fresh && gameplayConfirmed(input.control, input.dotaMatchId, now)
          ? "CONFIRMED"
          : "UNKNOWN"
        : "PREPARING";
  const result = verified
    ? "VERIFIED"
    : input.status === "CANCELLED"
      ? "CANCELLED"
      : r?.reconciliation?.exhausted
        ? "UNVERIFIED"
        : "PENDING";
  const timeline: MatchTracking["timeline"] = [
    {
      label: "Intento creado",
      at: input.createdAt.toISOString(),
      source: "DRAFTORY",
    },
  ];
  const add = (
    label: string,
    at: Date | null | undefined,
    source: "DRAFTORY" | "GC" | "PROVIDER",
  ) => {
    if (at) timeline.push({ label, at: at.toISOString(), source });
  };
  if (input.roomCreatedAt)
    timeline.unshift({
      label: "Sala creada",
      at: input.roomCreatedAt.toISOString(),
      source: "DRAFTORY",
    });
  add("ReadyCheck iniciado", input.readyCheck?.startedAt, "DRAFTORY");
  add("ReadyCheck confirmado", input.readyCheck?.completedAt, "DRAFTORY");
  add("Lobby confirmado", input.lobby?.gcConfirmedAt, "GC");
  add(
    "Autorización de Launch consumida",
    input.control?.consumedAt,
    "DRAFTORY",
  );
  add(
    "Servidor asociado al intento · inicio por verificar",
    input.control?.startedObservedAt,
    "GC",
  );
  if (postgame)
    add("POSTGAME observado", new Date(lifecycle!.postgameAt!), "GC");
  if (gcTerminal)
    add("Resultado terminal recibido", new Date(gc!.obtainedAt!), "GC");
  if (verified) add("Resultado verificado", input.finishedAt, "PROVIDER");
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    activity,
    result,
    externalMatchId: input.dotaMatchId,
    timeline,
    label: verified
      ? "Finalizada"
      : result === "CANCELLED"
        ? "Cancelada"
        : result === "UNVERIFIED"
          ? "No fue posible verificar el resultado"
          : activity === "UNKNOWN"
            ? now - (input.control?.startedObservedAt?.getTime() ?? now) >
              180000
              ? "Recuperación pendiente · reserva protegida"
              : "Verificando inicio · reserva protegida"
            : activity === "ENDED"
              ? "Resultado pendiente de verificación"
              : activity === "CONFIRMED"
                ? "En vivo"
                : "En preparación",
  };
}
