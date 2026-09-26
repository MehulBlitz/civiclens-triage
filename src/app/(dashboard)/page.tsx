"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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

  // Mobile detail sheet — opens when a complaint is selected on a phone,
  // dismissed with ✕. Desktop keeps the always-visible sidebar panel.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDismissed, setSheetDismissed] = useState(false);
  useEffect(() => {
    if (selected) setSheetDismissed(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 lg:space-y-5">
      {dbError && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-bold">Database:</span>
          <span>{dbError}</span>
          <span className="text-rose-500">
            — set DATABASE_URL in Settings → Environment, then refresh.
          </span>
        </div>
      )}

      <StatsStrip stats={stats} />

      {/* ============ MOBILE: one focused column + bottom-sheet detail ============ */}
      <div className="lg:hidden">
        <div className="space-y-4">
          <IngestPanel onTriaged={onTriaged} />
          <FilterBar />
          <QueueList
            items={filtered}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id);
              setSheetOpen(true);
            }}
          />
          <LiveFeed onTriaged={onTriaged} />
        </div>

        <AnimatePresence>
          {sheetOpen && selected && !sheetDismissed && (
            <>
              <motion.button
                type="button"
                aria-label="Close details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSheetOpen(false)}
                className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[2px]"
              />
              <motion.section
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 90 || info.velocity.y > 500) setSheetOpen(false);
                }}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
                aria-label="Complaint details"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--line)] bg-white/95 px-4 py-2.5 backdrop-blur">
                  <span className="label">Complaint details</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-ink-400">
                      #{selected.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      aria-label="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--paper-sunken)] text-ink-500 transition active:scale-90"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden>
                        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Drag handle affordance */}
                <div className="flex justify-center pt-1.5">
                  <span className="h-1 w-10 rounded-full bg-ink-300/70" aria-hidden />
                </div>
                <div className="px-4 pt-3">
                  <DetailPanel
                    complaint={selected}
                    onStatusChange={onStatusChange}
                    saving={saving}
                  />
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ============ DESKTOP: two-pane instrument layout ============ */}
      <div className="hidden grid-cols-1 gap-5 xl:grid xl:grid-cols-12">
        {/* Left column: ingest + live feed */}
        <div className="space-y-5 xl:col-span-4">
          <IngestPanel onTriaged={onTriaged} />
          <LiveFeed onTriaged={onTriaged} />
        </div>

        {/* Middle column: filters + queue */}
        <div className="space-y-5 xl:col-span-5">
          <FilterBar />
          <QueueList
            items={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right column: detail panel */}
        <div className="xl:col-span-3">
          <div className="xl:sticky xl:top-6">
            <DetailPanel
              complaint={selected}
              onStatusChange={onStatusChange}
              saving={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
