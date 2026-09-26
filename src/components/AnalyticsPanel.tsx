"use client";

import { useMemo, useState } from "react";
import type { Complaint } from "@/lib/schema";
import { CATEGORY_DEPARTMENT, SLA_HOURS, slaState } from "@/lib/civic";
import TrendChart from "./ui/TrendChart";
import DeptLoadChart from "./ui/DeptLoadChart";

/**
 * Command-center analytics: resolution funnel, SLA risk board and
 * department load — all derived client-side from the loaded complaints.
 * Third tab adds the temporal trend + workload story (ECharts).
 */
export default function AnalyticsPanel({ complaints }: { complaints: Complaint[] }) {
  const [tab, setTab] = useState<"sla" | "departments" | "trends">("sla");

  const analytics = useMemo(() => {
    const now = Date.now();
    const open = complaints.filter((c) => c.status !== "resolved");
    const breached = open.filter((c) => slaState(c.priority, c.createdAt, c.status).breached);
    const atRisk = open.filter((c) => {
      const s = slaState(c.priority, c.createdAt, c.status);
      return !s.breached && s.fraction >= 0.7;
    });
    const resolvedPct = complaints.length
      ? Math.round((complaints.filter((c) => c.status === "resolved").length / complaints.length) * 100)
      : 0;

    const byDept = new Map<string, { open: number; urgent: number; total: number }>();
    for (const c of open) {
      const d = byDept.get(c.routeTo) ?? { open: 0, urgent: 0, total: 0 };
      d.open += 1;
      if (c.priority === "urgent") d.urgent += 1;
      d.total += c.reportCount ?? 1;
      byDept.set(c.routeTo, d);
    }
    const deptRows = [...byDept.entries()]
      .map(([dept, v]) => ({ dept, ...v }))
      .sort((a, b) => b.total - a.total);

    const crowdRows = complaints
      .filter((c) => (c.reportCount ?? 1) > 1)
      .sort((a, b) => (b.reportCount ?? 1) - (a.reportCount ?? 1))
      .slice(0, 5);

    return { breached, atRisk, resolvedPct, deptRows, crowdRows, openCount: open.length };
  }, [complaints]);

  const maxLoad = Math.max(1, ...analytics.deptRows.map((d) => d.total));

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Command analytics</h2>
          <p className="text-xs text-slate-500">
            SLA clocks · department load · crowd clusters — live, zero extra queries
          </p>
        </div>
        <div className="seg flex w-full sm:w-auto" role="tablist" aria-label="Analytics view">
          {(["sla", "departments", "trends"] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-active={tab === t}
              onClick={() => setTab(t)}
              className="flex-1 sm:flex-none"
            >
              {t === "sla" ? "SLA watch" : t === "departments" ? "Dept load" : "14-day trends"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {tab === "sla" ? (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-lg bg-rose-50 px-3 py-2">
                <p className="text-lg font-bold text-rose-700">{analytics.breached.length}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">Breached</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <p className="text-lg font-bold text-amber-700">{analytics.atRisk.length}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">At risk</p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="text-lg font-bold text-emerald-700">{analytics.resolvedPct}%</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">Resolved</p>
              </div>
            </div>

            <div className="space-y-2">
              {[...analytics.breached, ...analytics.atRisk].slice(0, 4).map((c) => {
                const s = slaState(c.priority, c.createdAt, c.status);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span className={`font-bold ${s.breached ? "text-rose-600" : "text-amber-600"}`}>
                      {s.breached ? "BREACHED" : "AT RISK"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      #{c.id} · {c.summary}
                    </span>
                    <span className="text-slate-400">{s.label}</span>
                  </div>
                );
              })}
              {analytics.breached.length === 0 && analytics.atRisk.length === 0 && (
                <p className="text-xs text-emerald-600">
                  ✓ Every open complaint is comfortably inside its SLA window.
                </p>
              )}
            </div>

            {analytics.crowdRows.length > 0 && (
              <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                  🔥 Crowd-confirmed hotspots
                </p>
                <div className="mt-1.5 space-y-1">
                  {analytics.crowdRows.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-violet-900">
                        #{c.id} {c.category} · {c.locationText || "no location"}
                      </span>
                      <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        ×{c.reportCount} citizens
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : tab === "trends" ? (
          <div className="space-y-3">
            <div>
              <p className="label">Incident volume by severity · 14 days</p>
              <TrendChart complaints={complaints} />
            </div>
            <div>
              <p className="label">Department workload · open</p>
              <DeptLoadChart complaints={complaints} />
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {analytics.deptRows.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{d.dept}</span>
                  <span className="text-slate-400">
                    {d.open} open{d.urgent > 0 ? ` · ${d.urgent} urgent` : ""} · load {d.total}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${d.urgent > 0 ? "bg-rose-500" : "bg-civic-500"}`}
                    style={{ width: `${(d.total / maxLoad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {analytics.deptRows.length === 0 && (
              <p className="text-xs text-slate-500">No open complaints — all quiet.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
