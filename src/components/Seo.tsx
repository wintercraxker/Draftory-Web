import type { Metadata } from "next";

export const siteMetadata: Metadata = {
  title: "draftory.lol | Salas de Dota 2 y partidas en vivo",
  description:
    "Crea salas de Dota 2, juega con tu comunidad y sigue partidas en vivo con predicciones de monedas ficticias.",
  metadataBase: new URL("https://draftory.lol"),
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  openGraph: {
    title: "draftory.lol | Salas de Dota 2 y partidas en vivo",
    description:
      "Crea salas, juega Dota 2 y sigue cada partida con tu comunidad.",
    type: "website",
  },
};

export default siteMetadata;
