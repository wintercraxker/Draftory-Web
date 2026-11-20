import type {
  NotificationFeed,
  NotificationItem,
} from "../real/notifications-repository";

/** Receipt history, not a second feed. Uses server time; initial/catch-up reads stay silent. */
export class NotificationSoundTracker {
  private seen = new Set<string>();
  private serverAt: number | null = null;
  observe(
    feed: NotificationFeed,
    audible = true,
  ): NotificationItem | undefined {
    const at = Date.parse(feed.serverNow);
    if (!Number.isFinite(at)) return;
    const baseline = this.serverAt;
    const fresh =
      baseline === null
        ? []
        : feed.items.filter((item) => {
            const created = Date.parse(item.createdAt);
            return (
              !this.seen.has(item.id) &&
              !item.readAt &&
              Number.isFinite(created) &&
              created >= Math.max(baseline - 2000, at - 120000) &&
              created <= at + 5000
            );
          });
    this.seen = new Set(
      [...this.seen, ...feed.items.map((item) => item.id)].slice(-500),
    );
    this.serverAt = Math.max(this.serverAt ?? at, at);
    if (!audible) return;
    return (
      fresh.find((item) =>
        ["ACHIEVEMENT", "LEVEL_UP", "MVP"].includes(item.type),
      ) ?? fresh[0]
    );
  }
}
