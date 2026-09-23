"use client";

import type { Stats } from "@/lib/queries";
import AnimatedNumber from "./ui/AnimatedNumber";

function Tile({
  label,
  value,
  format,
  hint,
  accent,
  live
}: {
  label: string;
  value: number | string;
  format?: (v: number) => string;
  hint: string;
  accent: string;
  live?: boolean;
}) {
  return (
    <div
      className="card group relative flex flex-col gap-1 px-4 py-3.5 transition-shadow duration-200 hover:shadow-lift"
      style={{ borderRadius: "var(--radius)" }}
    >
      {/* accent rail — instrument-panel styling */}
      <span
        aria-hidden
        className="absolute left-0 top-3 h-[calc(100%-24px)] w-[3px] rounded-full opacity-70"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 pl-1.5">
        {live && (
          <span
            className={`h-1.5 w-1.5 rounded-full animate-city-pulse`}
            style={{ background: accent }}
          />
        )}
        <span className="label">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 pl-1.5">
        {typeof value === "number" ? (
          <AnimatedNumber
            value={value}
            format={format}
            className="text-2xl font-bold tracking-tight text-ink-900"
          />
        ) : (
          <span className="text-2xl font-bold tracking-tight text-ink-900">{value}</span>
        )}
        <span className="text-xs text-ink-400">{hint}</span>
      </div>
    </div>
  );
}

export default function StatsStrip({ stats }: { stats: Stats }) {
  const categories = Object.keys(stats.byCategory).length;
  const departments = Object.keys(stats.byDepartment).length;
  const locatedPct = stats.total
    ? Math.round((stats.located / stats.total) * 100)
    : 0;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Total"
        value={stats.total}
        hint="complaints"
        accent="var(--blue-500)"
        live
      />
      <Tile
        label="Open"
        value={stats.open}
        hint="awaiting action"
        accent="#4a8fb8"
      />
      <Tile
        label="Urgent"
        value={stats.urgent}
        hint="safety hazards"
        accent="var(--sev-urgent)"
        live={stats.urgent > 0}
      />
      <Tile
        label="Needs review"
        value={stats.needsReview}
        hint="L3 queue"
        accent="#7c5cb8"
      />
      <Tile
        label="On map"
        value={`${locatedPct}%`}
        hint={`${stats.located}/${stats.total} geocoded`}
        accent="#3f9d6b"
      />
      <Tile
        label="AI confidence"
        value={stats.avgConfidence || 0}
        format={(v) => (v > 0 ? `${Math.round(v * 100)}%` : "—")}
        hint={`${categories} cats · ${departments} depts`}
        accent="#d97e2b"
      />
    </section>
  );
}
