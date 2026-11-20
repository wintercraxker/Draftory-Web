import type { NextConfig } from "next";

// A separate, explicitly selected audit build never replaces an open server's build.
const auditDist = process.env.DRAFTORY_AUDIT_DIST_DIR;
if (
  auditDist &&
  !/^\.tmp\/auditoria-pre-beta-[a-z0-9-]+\/next-build$/.test(auditDist)
)
  throw new Error("INVALID_AUDIT_DIST_DIR");
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  // Automated local fixture tests can coexist with the developer's open server.
  ...(process.env.NODE_ENV !== "production" &&
  process.env.DRAFTORY_MULTIPLAYER_TEST_RUN === "true"
    ? { distDir: ".tmp/multiplayer-next-test" }
    : process.env.NODE_ENV !== "production" &&
        process.env.DRAFTORY_MULTIPLAYER_DEV_SERVER === "true"
      ? { distDir: ".tmp/multiplayer-next" }
      : {}),
  ...(auditDist ? { distDir: auditDist } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.steamstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.cloudflare.steamstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "steamcdn-a.akamaihd.net",
        pathname: "/steamcommunity/public/images/avatars/**",
      },
    ],
  },
};

export default nextConfig;
