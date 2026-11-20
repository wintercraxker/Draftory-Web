import type { PlayerHoverProfile } from "./player-hover";
export class HoverHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
type Entry = {
  until: number;
  promise: Promise<PlayerHoverProfile>;
};
export class PlayerHoverCache {
  private entries = new Map<string, Entry>();
  private active = 0;
  private queue: {
    run: () => void;
    cancel: () => void;
  }[] = [];
  private fetcher: typeof fetch;
  private now: () => number;
  constructor(fetcher: typeof fetch = fetch, now = () => Date.now()) {
    this.fetcher = fetcher;
    this.now = now;
  }
  clear() {
    this.entries.clear();
    for (const task of this.queue.splice(0)) task.cancel();
  }
  get size() {
    return this.entries.size;
  }
  get(viewer: string, reference: string) {
    const key = viewer + ":" + reference,
      old = this.entries.get(key);
    if (old && old.until > this.now()) return old.promise;
    this.entries.delete(key);
    if (this.entries.size >= 100)
      this.entries.delete(this.entries.keys().next().value!);
    const entry: Entry = {
      until: Infinity,
      promise: Promise.resolve(null as unknown as PlayerHoverProfile),
    };
    entry.promise = new Promise<PlayerHoverProfile>((resolve, reject) => {
      const run = () => {
        this.active++;
        void this.fetcher
          .call(
            globalThis,
            "/api/players/" + encodeURIComponent(reference) + "/hover",
            {
              cache: "no-store",
              credentials: "same-origin",
              signal: AbortSignal.timeout(8000),
            },
          )
          .then(async (r) => {
            if (!r.ok)
              throw new HoverHttpError(
                r.status === 401
                  ? "Inicia sesión para ver mini perfiles."
                  : r.status === 404
                    ? "Perfil no disponible."
                    : r.status === 429
                      ? "Espera un momento antes de consultar más perfiles."
                      : "No se pudo cargar el perfil.",
                r.status,
              );
            return r.json() as Promise<PlayerHoverProfile>;
          })
          .then(
            (data) => {
              entry.until = this.now() + 15000;
              resolve(data);
            },
            (error) => {
              entry.until =
                this.now() +
                (error instanceof HoverHttpError && error.status === 404
                  ? 5000
                  : 1000);
              reject(error);
            },
          )
          .finally(() => {
            this.active--;
            this.queue.shift()?.run();
          });
      };
      const task = {
        run,
        cancel: () => {
          entry.until = 0;
          reject(new DOMException("Discarded", "AbortError"));
        },
      };
      if (this.active < 2) run();
      else {
        if (this.queue.length >= 6) this.queue.shift()?.cancel();
        this.queue.push(task);
      }
    });
    this.entries.set(key, entry);
    return entry.promise;
  }
}
