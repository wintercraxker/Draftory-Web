import { AccessScreen } from "./AccessScreen";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/session";

// Server-side guard. Client/demo tokens are never accepted here.
export default async function PrivateArea({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return <AccessScreen />;
  if (!user.profile?.onboardingCompletedAt) redirect("/onboarding");
  return children;
}
