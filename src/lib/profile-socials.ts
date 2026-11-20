export const socialPlatforms = [
  "discord",
  "twitch",
  "youtube",
  "x",
  "github",
  "dotabuff",
] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;
export type ProfileSocials = {
  links: SocialLinks;
  dotabuff: string | null;
  dotabuffEditable?: boolean;
  dotabuffGenerated?: string | null;
};
export const socialLabels: Record<SocialPlatform, string> = {
  discord: "Discord",
  twitch: "Twitch",
  youtube: "YouTube",
  x: "X / Twitter",
  github: "GitHub",
  dotabuff: "Dotabuff",
};
export function normalizeSocialUrl(
  platform: SocialPlatform,
  value: unknown,
): string | null {
  if (typeof value === "string") value = value.trim();
  if (value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 250 ||
    /[\s\\%<>\u0000-\u001f]/u.test(value)
  )
    throw Error(
      `${socialLabels[platform]}: introduce una URL de perfil válida.`,
    );
  if (!/^https?:\/\//i.test(value)) {
    if (platform === "discord") {
      if (!/^[1-9]\d{16,19}$/.test(value))
        throw Error(
          "Discord: introduce el ID numérico de la cuenta o su URL discord.com/users/ID. Un nombre de usuario no permite construir ese enlace.",
        );
      value = "https://discord.com/users/" + value;
    } else if (platform === "dotabuff") {
      if (!/^[1-9]\d{0,9}$/.test(value))
        throw Error(
          "Dotabuff: introduce una URL HTTPS de jugador o su ID numérico.",
        );
      value = "https://www.dotabuff.com/players/" + value;
    } else {
      const handle = value.replace(/^@/, "");
      value =
        platform === "twitch"
          ? "https://www.twitch.tv/" + handle
          : platform === "x"
            ? "https://x.com/" + handle
            : platform === "github"
              ? "https://github.com/" + handle
              : "https://www.youtube.com/" +
                (/^UC[a-zA-Z0-9_-]{22}$/.test(handle)
                  ? "channel/" + handle
                  : "@" + handle);
    }
  }
  let u: URL;
  try {
    u = new URL(String(value));
  } catch {
    throw Error(`${socialLabels[platform]}: utiliza una URL HTTPS completa.`);
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.search ||
    u.hash
  )
    throw Error(
      `${socialLabels[platform]}: utiliza una URL HTTPS de perfil sin parámetros.`,
    );
  const path = u.pathname.replace(/\/$/, "");
  let valid = false,
    canonical = host;
  if (platform === "discord") {
    valid = host === "discord.com" && /^\/users\/[1-9]\d{16,19}$/.test(path);
    canonical = "discord.com";
  }
  if (platform === "twitch") {
    valid =
      host === "twitch.tv" &&
      /^\/[a-zA-Z0-9_]{3,25}$/.test(path) &&
      !/^\/(directory|downloads|settings|videos|search)$/i.test(path);
    canonical = "www.twitch.tv";
  }
  if (platform === "youtube") {
    valid =
      host === "youtube.com" &&
      /^\/(?:@[\p{L}\p{N}_.-]{3,30}|channel\/UC[a-zA-Z0-9_-]{22}|(?:c|user)\/[a-zA-Z0-9_.-]{1,100})$/u.test(
        path,
      );
    canonical = "www.youtube.com";
  }
  if (platform === "x") {
    valid =
      ["x.com", "twitter.com"].includes(host) &&
      /^\/[a-zA-Z0-9_]{1,15}$/.test(path) &&
      !/^\/(home|explore|search|settings|intent|share|login|signup|i)$/i.test(
        path,
      );
    canonical = "x.com";
  }
  if (platform === "github") {
    valid =
      host === "github.com" &&
      /^\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(path) &&
      !/^\/(login|settings|features|marketplace|explore|topics|orgs|about|security|pricing)$/i.test(
        path,
      );
    canonical = "github.com";
  }
  if (platform === "dotabuff") {
    const id = /^\/players\/([1-9]\d{0,9})$/.exec(path)?.[1];
    valid = host === "dotabuff.com" && !!id && Number(id) <= 4294967295;
    canonical = "www.dotabuff.com";
  }
  if (!valid)
    throw Error(
      `${socialLabels[platform]}: el enlace debe apuntar a un perfil de esa plataforma.`,
    );
  return `https://${canonical}${path}`;
}
export function socialIdentifier(
  platform: SocialPlatform | "dotabuff",
  url: string,
): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    if (platform === "youtube" && !path.startsWith("/@")) return url;
    const id = decodeURIComponent(path.split("/").at(-1) ?? "");
    return ["twitch", "x"].includes(platform) ? "@" + id : id;
  } catch {
    return "";
  }
}
export function socialTooltip(
  platform: SocialPlatform | "dotabuff",
  url: string,
): string {
  const name = platform === "dotabuff" ? "Dotabuff" : socialLabels[platform],
    id = socialIdentifier(platform, url);
  return id ? `${name} · ${id}` : name;
}
export function validateSocialLinks(input: unknown): SocialLinks {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !socialPlatforms.includes(k as SocialPlatform),
    )
  )
    throw Error("Campos de redes sociales no permitidos.");
  const links: SocialLinks = {};
  for (const platform of socialPlatforms) {
    const value = (input as Record<string, unknown>)[platform];
    if (value === undefined) continue;
    const url = normalizeSocialUrl(platform, value);
    if (url) links[platform] = url;
  }
  return links;
}
