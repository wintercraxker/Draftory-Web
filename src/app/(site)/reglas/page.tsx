import { RulesContent } from "@/components/moderation/RulesContent";
import { readReportIdentity } from "@/lib/real/profile-repository";
export default async function Rules({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; report?: string }>;
}) {
  const { player, report } = await searchParams;
  const target = player ? await readReportIdentity(player) : null;
  return (
    <RulesContent
      key={player ?? report ?? "rules"}
      targetId={player ?? ""}
      target={target}
      initialReport={!!report}
    />
  );
}
