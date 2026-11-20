import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { requireStaff } from "@/lib/real/moderation-repository";
import { AccountError } from "@/lib/real/errors";
import { StaffEntryError } from "@/components/auth/StaffEntryError";
import { AccessScreen } from "@/components/auth/AccessScreen";
import "./staff.css";
export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user;
  try {
    user = await getSessionUser();
  } catch {
    return <StaffEntryError />;
  }
  if (!user) return <AccessScreen />;
  if (!user.profile?.onboardingCompletedAt) redirect("/onboarding");
  try {
    await requireStaff(user.id);
  } catch (error) {
    if (error instanceof AccountError && error.status === 403)
      return <AccessScreen denied />;
    return <StaffEntryError />;
  }
  return children;
}
