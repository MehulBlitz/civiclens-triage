"use client";

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

  return (
    <div className="space-y-5 xl:grid xl:grid-cols-12 xl:gap-5">
      {/* Map + twin column */}
      <div className="space-y-5 xl:col-span-9">
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-slate-100 px-6 text-center text-sm text-slate-500">
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
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-civic-300 hover:text-civic-800"
                  >
                    #{c.id} {c.category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ============ CIVIC DIGITAL TWIN ============ */}
        <section className="card overflow-hidden bg-civic-950">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
            <div>
              <h2 className="text-sm font-bold text-white">
                Civic digital twin
              </h2>
              <p className="text-xs text-civic-200">
                Incidents as spatial objects — craters, flood volumes, waste
                heaps; blocks rise with complaint density · drag to orbit,
                scroll to zoom
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
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
          </div>

          <div className="px-4 pt-4">
            <TwinWrapper
              items={filtered.slice(0, 24)}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          </div>
        </section>
      </div>

      {/* Detail sidebar */}
      <div className="xl:col-span-3">
        <DetailPanel
          complaint={selected}
          onStatusChange={onStatusChange}
          saving={saving}
        />
      </div>
    </div>
  );
}
