"use client";

import { useCivic } from "@/components/CivicProvider";
import StatsStrip from "@/components/StatsStrip";
import IngestPanel from "@/components/IngestPanel";
import QueueList from "@/components/QueueList";
import DetailPanel from "@/components/DetailPanel";
import FilterBar from "@/components/FilterBar";
import LiveFeed from "@/components/LiveFeed";

export default function OverviewPage() {
  const {
    dbError,
    stats,
    onTriaged,
    selected,
    onStatusChange,
    saving,
    filtered,
    setSelectedId,
  } = useCivic();

  return (
    <div className="space-y-5">
      {dbError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-bold">Database:</span>
          <span>{dbError}</span>
          <span className="text-rose-500">
            — set DATABASE_URL in Settings → Environment, then refresh.
          </span>
        </div>
      )}

      <StatsStrip stats={stats} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left column: ingest + live feed + detail */}
        <div className="space-y-5 xl:col-span-4">
          <IngestPanel onTriaged={onTriaged} />
          <LiveFeed onTriaged={onTriaged} />
          <DetailPanel
            complaint={selected}
            onStatusChange={onStatusChange}
            saving={saving}
          />
        </div>

        {/* Right column: filters + queue */}
        <div className="space-y-5 xl:col-span-8">
          <FilterBar />
          <QueueList
            items={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </div>
      </div>
    </div>
  );
}
