// Only stored Steam CDN resources and our versioned, authenticated avatar route.
export function staffAvatar(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(value))
    return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return undefined;
    if (
      [
        "avatars.steamstatic.com",
        "avatars.cloudflare.steamstatic.com",
      ].includes(url.hostname) ||
      (url.hostname === "steamcdn-a.akamaihd.net" &&
        url.pathname.startsWith("/steamcommunity/public/images/avatars/"))
    )
      return url.href;
  } catch {
    /* Missing or invalid resources use initials. */
  }
  return undefined;
}
