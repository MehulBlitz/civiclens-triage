"use client";

import { useState } from "react";
import { useCivic } from "@/components/CivicProvider";
import MapWrapper from "@/components/MapWrapper";
import TwinWrapper from "@/components/TwinWrapper";
import DetailPanel from "@/components/DetailPanel";

const PRIORITY_DOTS: Record<string, string> = {
  urgent: "#e11d48",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#0ea5e9",
};

export default function MapPage() {
  const {
    filtered,
    located,
    unlocated,
    selected,
    setSelectedId,
    onStatusChange,
    saving,
  } = useCivic();

  // The 3D twin is the heavy piece — collapsed by default on phones so the
  // map is instantly usable; one tap expands it.
  const [twinOpen, setTwinOpen] = useState(false);

  return (
    <div className="space-y-4 xl:grid xl:grid-cols-12 xl:gap-5 xl:space-y-0">
      {/* Map + twin column */}
      <div className="space-y-4 xl:col-span-9 xl:space-y-5">
        <section className="card p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink-900">
                Live complaint map
              </h2>
              <p className="text-xs text-ink-500">
                OpenStreetMap · free geocoding via Nominatim ·{" "}
                {located.length} of {filtered.length} filtered complaints located
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              {(["urgent", "high", "medium", "low"] as const).map((p) => (
                <span key={p} className="inline-flex items-center gap-1.5 text-slate-600">
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                    style={{ background: PRIORITY_DOTS[p] }}
                  />
                  {p}
                </span>
              ))}
            </div>
          </div>

          {located.length > 0 ? (
            <MapWrapper
              complaints={located}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="flex h-[320px] w-full items-center justify-center rounded-xl bg-slate-100 px-6 text-center text-sm text-slate-500 sm:h-[420px]">
              No geocoded complaints in the current filter. Ingest one with a
              landmark or address — Nominatim will place it here.
            </div>
          )}

          {unlocated.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
              <p className="label">
                Not on map (no coordinates): {unlocated.length}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {unlocated.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-civic-300 hover:text-civic-800 active:scale-95"
                  >
                    #{c.id} {c.category}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mobile: selected complaint expands below the map (no side rail) */}
          <div className="mt-4 xl:hidden">
            <DetailPanel
              complaint={selected}
              onStatusChange={onStatusChange}
              saving={saving}
            />
          </div>
        </section>

        {/* ============ CIVIC DIGITAL TWIN ============ */}
        <section className="card overflow-hidden bg-civic-950">
          {/* Mobile: collapsible header row */}
          <button
            type="button"
            onClick={() => setTwinOpen((v) => !v)}
            className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-left sm:px-5"
            aria-expanded={twinOpen}
          >
            <div>
              <h2 className="text-sm font-bold text-white">
                Civic digital twin{" "}
                <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-civic-200 xl:hidden">
                  {twinOpen ? "tap to hide" : "tap to expand"}
                </span>
              </h2>
              <p className="text-xs text-civic-200">
                Incidents as spatial objects — craters, flood volumes, waste
                heaps · drag to orbit, scroll to zoom
              </p>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-4 w-4 shrink-0 text-civic-200 transition-transform ${twinOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* Desktop: legend always visible; mobile: only when expanded */}
          {(twinOpen || true) && (
            <div className="hidden flex-wrap gap-1.5 border-b border-white/10 px-5 py-2 text-[10px] font-bold uppercase tracking-wide xl:flex">
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                ⬤ pothole crater
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                ▣ flood volume
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                ▲ waste heap
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                ◎ pulse = emerging
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                ◯ ring = critical
              </span>
            </div>
          )}

          <div className={twinOpen ? "px-3 pt-3 sm:px-4 sm:pt-4" : "hidden xl:block xl:px-4 xl:pt-4"}>
            <TwinWrapper
              items={filtered.slice(0, 24)}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          </div>
        </section>
      </div>

      {/* Desktop detail sidebar */}
      <div className="hidden xl:block xl:col-span-3">
        <div className="xl:sticky xl:top-6">
          <DetailPanel
            complaint={selected}
            onStatusChange={onStatusChange}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
