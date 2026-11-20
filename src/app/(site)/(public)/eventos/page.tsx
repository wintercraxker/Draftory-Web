import { redirect } from "next/navigation";

// Compatibility for old bookmarks; the legacy event market is retired.
export default function EventsPage() {
  redirect("/salas");
}
