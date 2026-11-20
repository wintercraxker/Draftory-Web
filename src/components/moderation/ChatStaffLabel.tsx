import { publicTeamRoles, type PublicTeamRole } from "@/lib/public-team";
import { Gem, ShieldCheck, Shield, LifeBuoy } from "lucide-react";
const names: Record<PublicTeamRole, string> = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MODERATOR: "MOD",
  HELPER: "HELPER",
};
const icons = {
  OWNER: Gem,
  ADMIN: ShieldCheck,
  MODERATOR: Shield,
  HELPER: LifeBuoy,
};
/** Presentation only; the chat DTO supplies the current authorized server grant. */
export function ChatStaffLabel({ role }: { role?: PublicTeamRole }) {
  if (!role || !Object.hasOwn(names, role)) return null;
  const Icon = icons[role];
  return (
    <span
      className="chat-staff-label"
      data-role={role}
      aria-label={`Staff · ${publicTeamRoles[role].label}`}
      title={publicTeamRoles[role].label}
    >
      <Icon size={10} aria-hidden="true" strokeWidth={2} />
      {names[role]}
    </span>
  );
}
