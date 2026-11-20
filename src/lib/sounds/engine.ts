"use client";

export const soundFiles = {
  notification: "soundshelfstudio-ui-app-notification-524745.mp3",
  confirmation: "soundshelfstudio-ui-chime-confirm-567486.mp3",
  success: "soundshelfstudio-ui-success-chime-513565.mp3",
  error: "universfield-error-notification-129258.mp3",
  reward: "universfield-level-up-191997.mp3",
} as const;
export type Sound = keyof typeof soundFiles;
export const soundGroups = [
  "notifications",
  "rooms",
  "feedback",
  "rewards",
  "staff",
] as const;
export type SoundGroup = (typeof soundGroups)[number];
export type SoundPreferences = {
  enabled: boolean;
  volume: number;
  chatWheelEnabled: boolean;
  chatWheelVolume: number;
};
export const defaultSoundPreferences: SoundPreferences = {
  enabled: true,
  volume: 0.25,
  chatWheelEnabled: false,
  chatWheelVolume: 0.25,
};
const preferenceKey = "draftory:sounds:v2",
  legacyKey = "draftory:sounds:v1",
  seenKey = "draftory:sounds:seen:v1";
let preferences = { ...defaultSoundPreferences },
  initialized = false,
  unlocked = false,
  lastPlayed = 0;
let playing: HTMLAudioElement | undefined;
const audio = new Map<Sound, HTMLAudioElement>();
type PlaybackState =
  | "idle"
  | "interaction"
  | "muted"
  | "background"
  | "coordination"
  | "blocked"
  | "error"
  | "played"
  | "ended";
let playbackState: PlaybackState = "idle";
export function readSoundPlaybackState() {
  return playbackState;
}
function reportPlayback(state: PlaybackState) {
  playbackState = state;
  window.dispatchEvent(new Event("draftory:sound-status"));
}
export function normalizeSoundPreferences(
  stored: unknown,
  legacy = false,
): SoundPreferences {
  const value =
    stored && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  const volume = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(0, Math.min(1, v))
      : 0.25;
  return {
    enabled:
      value.enabled !== false &&
      (!legacy || soundGroups.every((group) => value[group] !== false)),
    volume: volume(value.volume),
    chatWheelEnabled: !legacy && value.chatWheelEnabled === true,
    chatWheelVolume: legacy ? 0.25 : volume(value.chatWheelVolume),
  };
}
/** Future controlled Chat Wheel renderer must consult this channel; no arbitrary URL player. */
export function audioChannelPreferences(
  value: SoundPreferences,
  channel: "platform" | "chatWheel",
) {
  return channel === "platform"
    ? { enabled: value.enabled, volume: value.volume }
    : { enabled: value.chatWheelEnabled, volume: value.chatWheelVolume };
}
export function readSoundPreferences(): SoundPreferences {
  if (typeof window === "undefined") return { ...defaultSoundPreferences };
  try {
    const current = localStorage.getItem(preferenceKey);
    if (current !== null) {
      try {
        return normalizeSoundPreferences(JSON.parse(current));
      } catch {
        /* Recover legacy explicit mutes if v2 storage is damaged. */
      }
    }
    return normalizeSoundPreferences(
      JSON.parse(localStorage.getItem(legacyKey) || "{}"),
      true,
    );
  } catch {
    return { ...preferences };
  }
}
export function initializeSounds() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  preferences = readSoundPreferences();
  try {
    if (localStorage.getItem(preferenceKey) === null)
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  } catch {
    /* Keep session-only preferences when storage is blocked. */
  }
  const unlock = (e: Event) => {
    if (e.isTrusted) unlocked = true;
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener("storage", (e) => {
    if (e.key === preferenceKey) {
      preferences = readSoundPreferences();
      if (!preferences.enabled || preferences.volume === 0) playing?.pause();
      else if (playing) playing.volume = preferences.volume;
      window.dispatchEvent(new Event("draftory:sounds-preferences"));
    }
  });
}
export function saveSoundPreferences(value: SoundPreferences) {
  initializeSounds();
  preferences = normalizeSoundPreferences(value);
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  } catch {
    /* Session preference still works. */
  }
  if (!preferences.enabled || preferences.volume === 0) playing?.pause();
  else if (playing) playing.volume = preferences.volume;
  window.dispatchEvent(new Event("draftory:sounds-preferences"));
}
export async function playSound(
  kind: Sound,
  _group: SoundGroup,
  eventId: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  initializeSounds();
  if (!soundGroups.includes(_group)) return false;
  if (!preferences.enabled || preferences.volume === 0) {
    reportPlayback("muted");
    return false;
  }
  if (!unlocked) {
    reportPlayback("interaction");
    return false;
  }
  if (document.visibilityState !== "visible") {
    reportPlayback("background");
    return false;
  }
  const perform = async () => {
    const now = Date.now();
    // Web Locks serialize all tabs. Without durable storage/locks prefer silence to duplicate effects.
    try {
      const seen = JSON.parse(localStorage.getItem(seenKey) || "{}");
      if (
        seen[eventId] ||
        now - lastPlayed < 1200 ||
        now - Number(seen.__last || 0) < 1200
      )
        return false;
      const entries = Object.entries(seen)
        .filter(
          ([key, time]) =>
            key !== "__last" &&
            typeof time === "number" &&
            now - time < 86400000,
        )
        .slice(-500);
      localStorage.setItem(
        seenKey,
        JSON.stringify({
          ...Object.fromEntries(entries),
          [eventId.slice(0, 250)]: now,
          __last: now,
        }),
      );
    } catch {
      return false;
    }
    try {
      playing?.pause();
      let player = audio.get(kind);
      if (!player) {
        player = new Audio("/sounds/" + soundFiles[kind]);
        player.preload = "none";
        player.addEventListener?.("ended", () => {
          if (playing === player) reportPlayback("ended");
        });
        audio.set(kind, player);
      }
      player.volume = preferences.volume;
      player.currentTime = 0;
      playing = player;
      lastPlayed = now;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          player.play(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              player!.pause();
              reject(new Error("AudioTimeout"));
            }, 8000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      reportPlayback("played");
      return true;
    } catch (error) {
      const blocked =
        error instanceof Error && error.name === "NotAllowedError";
      if (blocked) unlocked = false;
      reportPlayback(blocked ? "blocked" : "error");
      return false;
    } // No replay queue after autoplay rejection.
  };
  if (!navigator.locks) {
    reportPlayback("coordination");
    return false;
  }
  return navigator.locks.request(
    "draftory-sound",
    { ifAvailable: true },
    (lock) => (lock ? perform() : false),
  );
}
