import { redirect } from "next/navigation";

// No automatic Event -> Match mapping; use the current match browser.
export default function EventDetailPage() {
  redirect("/partidas");
}
