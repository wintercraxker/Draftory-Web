import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Actualizaciones de Draftory",
  description:
    "Descubre las novedades, mejoras y correcciones que llegan a nuestra comunidad.",
  openGraph: {
    title: "Actualizaciones de Draftory",
    description:
      "Descubre las novedades, mejoras y correcciones que llegan a nuestra comunidad.",
    type: "website",
  },
  // This dashboard page is private and currently contains an unpublished draft.
  robots: { index: false, follow: false },
};
export default function Page() {
  return null;
}
