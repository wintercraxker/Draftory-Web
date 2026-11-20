import "server-only";
/** Same image response used by the authenticated avatar route and public aliases. */
export function profileAvatarResponse(
  bytes: Uint8Array,
  version: string,
  cache = "private, max-age=300, must-revalidate",
) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cache,
      "Content-Security-Policy": "default-src 'none'",
      ETag: `"${version}"`,
    },
  });
}
