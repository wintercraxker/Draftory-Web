import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SteamOnboarding } from "@/components/auth/SteamOnboarding";
import { prisma } from "@/lib/prisma";
import { mmrInstalled } from "@/lib/real/mmr-repository";
import { mmrMaximum } from "@/lib/mmr-policy";
export default async function OnboardingPage() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/?auth=session_required");
  if (user.profile?.onboardingCompletedAt) redirect("/dashboard");
  const external = await prisma.dotaAccount.findUnique({
    where: { userId: user.id },
    select: { steamPersonaName: true },
  });
  return (
    <SteamOnboarding
      name={external?.steamPersonaName ?? ""}
      mmrEnabled={await mmrInstalled()}
      mmrMax={mmrMaximum()}
    />
  );
}
