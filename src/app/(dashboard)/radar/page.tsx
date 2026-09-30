"use client";

import { useMemo } from "react";
import { useCivic, RISK_CHIP } from "@/components/CivicProvider";

/**
 * Monsoon & flood radar — rain-sensitive incidents (drainage, sewage,
 * water) scored by the Civic Incident NN with live Open-Meteo rainfall.
 * Citizens see where waterlogging is brewing; officers see where to
 * pre-position desilting crews before the next downpour.
 */

const RAIN_SENSITIVE = new Set(["Drainage", "Sewage", "Water"]);

export default function RadarPage() {
  const { situations, complaints, riskLoading } = useCivic();

  const floodWatch = useMemo(
    () =>
      situations
        .filter((s) => RAIN_SENSITIVE.has(s.category))
        .sort((a, b) => b.complaintCount - a.complaintCount)
        .slice(0, 12),
    [situations]
  );

  const rainStats = useMemo(() => {
    const rainSituations = situations.filter((s) => (s.rainfallMm ?? 0) > 0);
    const maxRain = Math.max(0, ...rainSituations.map((s) => s.rainfallMm ?? 0));
    return { rainSituations, maxRain };
  }, [situations]);

  const sensitive = complaints.filter((c) => RAIN_SENSITIVE.has(c.category) && c.status !== "resolved");
  const critical = floodWatch.filter((s) => s.level === "CRITICAL" || s.level === "HIGH");

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-4 py-4 sm:px-6">
          <h1 className="text-lg font-black text-white">Monsoon &amp; flood radar</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            Live rainfall (Open-Meteo) × the Civic Incident NN over rain-sensitive clusters —
            drainage, sewage and water supply incidents become waterlogging risk.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-lg font-black text-white">{sensitive.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-civic-200">rain-sensitive open</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-lg font-black text-rose-300">{critical.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-civic-200">high/critical zones</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-lg font-black text-sky-300">{rainStats.maxRain > 0 ? `${rainStats.maxRain.toFixed(1)}` : "0"}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-civic-200">mm rain / 24h peak</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="card px-4 py-4 sm:px-5 xl:col-span-7">
          <h2 className="text-sm font-bold text-ink-900">Flood watch list</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Rain-sensitive complaint clusters ranked by volume and neural risk score.
            {riskLoading && <span className="ml-2 animate-pulseSoft">scoring…</span>}
          </p>
          {floodWatch.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No rain-sensitive clusters right now — the city is dry.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {floodWatch.map((s) => (
                <li key={s.id} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`chip ${RISK_CHIP[s.level] ?? RISK_CHIP.LOW}`}>NN: {s.level}</span>
                    <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                      {s.category} ×{s.complaintCount}
                    </span>
                    {s.rainfallMm != null && s.rainfallMm > 0 && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                        🌧 {s.rainfallMm}mm/24h
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-ink-900">{s.location ?? "citywide"}</p>
                  <p className="text-[11px] text-ink-500">{s.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5 xl:col-span-5">
          <section className="card px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-ink-900">How the radar works</h2>
            <ol className="mt-2 space-y-2 text-xs leading-relaxed text-ink-700">
              <li>
                <b>1 · Rainfall:</b> Open-Meteo hourly precipitation summed over the next 24 h for each cluster&apos;s coordinates (free, no key).
              </li>
              <li>
                <b>2 · Clustering:</b> open drainage/sewage/water complaints within 2 km become one flood-watch situation.
              </li>
              <li>
                <b>3 · Neural scoring:</b> the Civic Incident NN (trained on engineered city features) rates each cluster LOW → CRITICAL — rainfall is a live input feature.
              </li>
              <li>
                <b>4 · Pre-positioning:</b> CRITICAL zones are where desilting crews go <i>before</i> the rain, not after.
              </li>
            </ol>
          </section>

          <section className="card px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-ink-900">Rain-sensitive queue</h2>
            <p className="mt-0.5 text-xs text-ink-500">{sensitive.length} open incidents in flood-prone categories</p>
            <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {sensitive.slice(0, 15).map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className="rounded bg-[color:var(--paper-sunken)] px-1.5 py-0.5 font-semibold text-ink-700">{c.category}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{c.summary}</span>
                  <span className="shrink-0 text-[10px] text-ink-400">#{c.id}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
