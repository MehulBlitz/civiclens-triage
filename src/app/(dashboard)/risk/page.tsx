"use client";

import { useCivic, RISK_CHIP } from "@/components/CivicProvider";
import NeuralNetDiagram from "@/components/NeuralNetDiagram";

export default function RiskPage() {
  const {
    situations,
    riskLoading,
    refreshRisk,
    selected,
    selectedPrediction,
    riskSource,
    setSelectedId,
    complaints,
  } = useCivic();

  return (
    <div className="space-y-4 xl:space-y-5">
      {/* Header card */}
      <section className="card overflow-hidden bg-civic-950">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
          <div>
            <h2 className="text-sm font-bold text-white">
              Civic Incident Neural Network
            </h2>
            <p className="text-xs text-civic-200">
              From-scratch MLP (NumPy ↔ TS parity) scoring every complaint
              cluster for emerging risk · rule baseline shown for comparison
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRisk()}
            className="min-h-touch rounded-full border border-white/20 px-3.5 py-2 text-[11px] font-bold text-white transition hover:bg-white/10 active:scale-95 sm:py-1"
          >
            ↻ rescore situations
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
        {/* Situations */}
        <div className="space-y-4 xl:col-span-7 xl:space-y-5">
          <section className="card p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink-900">
                  Risk situations
                </h2>
                <p className="text-xs text-ink-500">
                  Spatial complaint clusters scored by the neural risk engine
                  {riskLoading && (
                    <span className="ml-2 animate-pulseSoft">scoring…</span>
                  )}
                </p>
              </div>
            </div>

            {situations.length === 0 && !riskLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No open complaint clusters to score yet — ingest complaints or
                start the live feed.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {situations.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.anchorId)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                      selected?.id === s.anchorId
                        ? "border-amber-400 bg-amber-50"
                        : "border-slate-200 bg-white hover:border-civic-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          RISK_CHIP[s.level] ?? RISK_CHIP.LOW
                        }`}
                      >
                        NN: {s.level}
                      </span>
                      {s.baselineLevel !== s.level && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          rules say {s.baselineLevel}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-ink-900">
                        {s.category} ×{s.complaintCount}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-700">
                      {s.location ?? "unlocated"}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
                      {s.explanation}
                      {s.rainfallMm != null && s.rainfallMm > 0
                        ? ` · rain ${s.rainfallMm}mm/24h`
                        : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* NN diagram + selection info */}
        <div className="space-y-4 xl:col-span-5 xl:space-y-5">
          <NeuralNetDiagram
            prediction={selectedPrediction}
            situationLabel={
              selected ? `#${selected.id} · ${selected.category}` : "no selection"
            }
          />
          <section className="card px-4 py-3 text-xs leading-relaxed text-ink-500">
            <p>
              <span className="font-bold text-ink-900">Live inference:</span>{" "}
              selecting a complaint runs the same network client-side over its
              exact situation features (or a single-complaint vector), so the
              diagram activations are real — not decoration. Decision source:{" "}
              <span className="font-semibold text-civic-700">{riskSource}</span>{" "}
              · scoring {situations.length} situations across{" "}
              {complaints.length} complaints.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
