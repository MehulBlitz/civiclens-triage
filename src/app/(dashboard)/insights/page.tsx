"use client";

import { useCivic } from "@/components/CivicProvider";
import InsightsPanel from "@/components/InsightsPanel";
import AnalyticsPanel from "@/components/AnalyticsPanel";

export default function InsightsPage() {
  const { complaints } = useCivic();

  return (
    <div className="space-y-5">
      <InsightsPanel />
      <AnalyticsPanel complaints={complaints} />
    </div>
  );
}
