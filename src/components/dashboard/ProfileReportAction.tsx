import Link from "next/link";
import { Flag } from "lucide-react";
export function ProfileReportAction({
  publicId,
}: {
  publicId: string | null | undefined;
}) {
  return publicId ? (
    <Link
      href={"/reglas?player=" + encodeURIComponent(publicId)}
      className="dashboard-link-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
    >
      <Flag size={13} />
      Reportar jugador
    </Link>
  ) : null;
}
