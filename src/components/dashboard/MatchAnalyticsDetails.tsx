"use client";
import type { DashboardMatch } from "@/lib/dashboard-data";
import type { MatchAnalytics } from "@/lib/dota-stats/match-analytics";
import type { HeroCatalogEntry } from "@/lib/dota-stats/types";
import {
  draftoryStudio,
  analyticsStudio,
} from "@/lib/match-studio/draftory-match";
import { MatchStudio } from "../match-studio/MatchStudio";
export function ExternalMatchAnalyticsDetails({
  analytics: a,
  catalog,
}: {
  analytics: MatchAnalytics;
  catalog: HeroCatalogEntry[];
}) {
  return <MatchStudio match={analyticsStudio(a)} catalog={catalog} embedded />;
}
export function MatchAnalyticsDetails({ match }: { match: DashboardMatch }) {
  const studio = draftoryStudio(match);
  return studio ? (
    <MatchStudio match={studio} catalog={match.heroCatalog ?? []} embedded />
  ) : null;
}
