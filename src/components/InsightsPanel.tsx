"use client";

import { useCallback, useEffect, useState } from "react";

type Insights = {
  duplicates: {
    nAnalyzed: number;
    pairs: { a: number; b: number; cosine: number; score: number; same_area: boolean }[];
    nPairs: number;
    flooding: {
      window_minutes: number;
      min_similar: number;
      flooded_ids: number[];
      n_flooded: number;
      suspicious: boolean;
    } | null;
  } | null;
  forecast: {
    forecast: number[];
    band: number[] | null;
    alpha: number | null;
    beta: number | null;
    trend: number | null;
    degraded: boolean;
    reason: string | null;
  } | null;
  anomalies: {
    latest_is_spike: boolean;
    spike_indices: number[];
    threshold: number;
    median: number;
  } | null;
  seriesLength: number;
  dbError: string | null;
};

/**
 * InsightsPanel — corpus analytics from the Python ML service:
 * duplicate complaints, coordinated-flooding detection, daily volume
 * forecast (Holt smoothing) and robust spike anomalies.
 * Degrades honestly: unavailable service → "unavailable" notes, not errors.
 */
export default function InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      setData((await res.json()) as Insights);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) void load();
  }, [open, data, loading, load]);

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div>
          <h2 className="text-sm font-bold text-ink-900">Corpus insights</h2>
          <p className="text-xs text-ink-500">
            Duplicate detection · coordinated-flood alarms · volume forecast
          </p>
        </div>
        <span className="text-xs font-semibold text-civic-700">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[color:var(--line)] px-5 py-4">
          {loading && (
            <p className="text-xs text-slate-400">Analyzing corpus…</p>
          )}

          {!loading && data?.dbError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {data.dbError}
            </p>
          )}

          {!loading && data && !data.dbError && (
            <>
              {/* Duplicates */}
              <div>
                <p className="label">Duplicate complaints (TF-IDF + geo)</p>
                {data.duplicates ? (
                  data.duplicates.nPairs > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {data.duplicates.pairs.map((p) => (
                        <div
                          key={`${p.a}-${p.b}`}
                          className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs"
                        >
                          <span className="font-semibold text-amber-900">
                            #{p.a} ↔ #{p.b}
                          </span>
                          <span className="text-amber-700">
                            {Math.round(p.score * 100)}% match
                            {p.same_area ? " · same area" : " · different areas"}
                          </span>
                        </div>
                      ))}
                      {data.duplicates.flooding?.suspicious && (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700">
                          ⚠ Coordinated flooding suspected:{" "}
                          {data.duplicates.flooding.n_flooded} near-identical
                          reports scattered across locations within{" "}
                          {data.duplicates.flooding.window_minutes} min
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      No likely duplicates among {data.duplicates.nAnalyzed}{" "}
                      complaints — queue looks clean.
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Duplicate detector unavailable (ML service offline).
                  </p>
                )}
              </div>

              {/* Forecast */}
              <div>
                <p className="label">Daily volume forecast (Holt, 7 days)</p>
                {data.forecast && !data.forecast.degraded ? (
                  <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
                    {data.forecast.forecast.map((v, i) => {
                      const max = Math.max(...data.forecast!.forecast);
                      return (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <div
                            className="w-6 rounded-t bg-blue-500/80"
                            style={{ height: `${Math.max(4, (v / Math.max(1, max)) * 40)}px` }}
                            title={`day +${i + 1}: ${v.toFixed(1)} complaints`}
                          />
                          <span className="text-[9px] text-slate-400">+{i + 1}d</span>
                        </div>
                      );
                    })}
                    <span className="ml-2 pb-1 text-[11px] text-slate-500">
                      trend {data.forecast.trend != null && data.forecast.trend >= 0 ? "+" : ""}
                      {data.forecast.trend?.toFixed(2) ?? "—"}/day
                      {data.anomalies?.latest_is_spike && (
                        <span className="ml-2 font-bold text-rose-600">
                          ⚠ today is a spike
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    {data.forecast?.reason === "insufficient_history"
                      ? "Not enough history yet for a meaningful forecast."
                      : "Forecast unavailable (ML service offline)."}
                  </p>
                )}
              </div>
            </>
          )}

          {!loading && !data && (
            <p className="text-xs text-slate-400">Insights unavailable.</p>
          )}
        </div>
      )}
    </section>
  );
}
