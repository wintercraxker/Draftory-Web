import { StaffPanel } from "@/components/moderation/StaffPanel";
import { getSessionUser } from "@/lib/auth/session";
import { staffAccess } from "@/lib/real/staff-access";
import { AccessScreen } from "@/components/auth/AccessScreen";
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; tab?: string }>;
}) {
  const { report, tab } = await searchParams;
  if (tab === "bots") {
    const user = await getSessionUser();
    if (!user) return <AccessScreen />;
    if ((await staffAccess(user.id)).role !== "OWNER")
      return <AccessScreen denied />;
  }
  return (
    <StaffPanel
      initialTab={tab === "bots" ? "bots" : ""}
      initialReport={
        typeof report === "string" && report.length <= 128 ? report : ""
      }
    />
  );
}
