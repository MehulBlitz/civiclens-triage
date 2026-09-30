"use client";

import { useCallback, useEffect, useState } from "react";
import type { Complaint } from "@/lib/schema";
import { PRIORITY_STYLE, STATUS_STYLE, slaState } from "@/lib/civic";

/**
 * Track any ticket publicly — no login. Citizens enter their complaint
 * number and see the full lifecycle: AI triage → dispatch → field proof →
 * officer verification, with the live SLA clock.
 */

const STAGES = [
  { key: "filed", label: "Filed & AI-triaged" },
  { key: "assigned", label: "Dispatched to field crew" },
  { key: "resolved", label: "Field proof submitted" },
  { key: "verified", label: "Verified & closed" }
] as const;

function stageIndex(c: Complaint): number {
  if (c.verified) return 3;
  if (c.resolvedAt) return 2;
  if (c.assignedAt || c.status === "assigned" || c.status === "in_progress") return 1;
  return 0;
}

export default function TrackPage() {
  const [input, setInput] = useState("");
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setComplaint(null);
    try {
      const res = await fetch(`/api/track?id=${id}`, { cache: "no-store" });
      const data = (await res.json()) as { complaint?: Complaint; error?: string };
      if (!res.ok || !data.complaint) throw new Error(data.error ?? "Ticket not found");
      setComplaint(data.complaint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load from ?id= for shareable links.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    if (Number.isInteger(id) && id > 0) {
      setInput(String(id));
      void lookup(id);
    }
  }, [lookup]);

  const p = complaint ? PRIORITY_STYLE[complaint.priority] ?? PRIORITY_STYLE.medium : null;
  const s = complaint ? STATUS_STYLE[complaint.status] : null;
  const sla = complaint ? slaState(complaint.priority, complaint.createdAt, complaint.status) : null;
  const stage = complaint ? stageIndex(complaint) : -1;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-5 py-4 sm:px-6">
          <h1 className="text-lg font-black text-white">Track your ticket</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            No login needed — every complaint gets a number. Follow it from AI triage to verified closure.
          </p>
        </div>
      </section>

      <section className="card px-4 py-4 sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = Number(input.replace(/[^0-9]/g, ""));
            if (Number.isInteger(id) && id > 0) void lookup(id);
            else setError("Enter a numeric ticket number, e.g. 12");
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="label min-w-[180px] flex-1">
            Ticket number
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 12"
              className="well mt-1 w-full text-sm"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-tactile btn-tactile-amber min-h-touch px-5 py-2.5 text-sm font-bold">
            {loading ? "Searching…" : "Track"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
      </section>

      {complaint && p && s && sla && (
        <section className="card overflow-hidden">
          <div className={`flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-5 py-3`} style={{ background: "var(--paper-sunken)" }}>
            <span className="text-sm font-black text-ink-900">Ticket #{complaint.id}</span>
            <span className={`chip ${p.chip}`}>{p.label}</span>
            <span className={`chip ${s.chip}`}>{s.label}</span>
            {complaint.reportCount > 1 && (
              <span className="chip border-violet-200 bg-violet-50 text-violet-700">🔥 ×{complaint.reportCount} citizens</span>
            )}
          </div>

          <div className="space-y-4 px-5 py-4">
            <p className="text-sm font-medium leading-relaxed text-ink-900">{complaint.summary}</p>
            <p className="text-xs text-ink-500">📍 {complaint.locationText ?? "no location"} · routed to {complaint.routeTo}</p>

            {/* SLA */}
            <div>
              <div className="flex items-center justify-between">
                <span className="label">SLA clock</span>
                <span className={`text-[11px] font-bold ${sla.breached ? "text-rose-600" : sla.fraction >= 0.7 ? "text-amber-600" : "text-emerald-600"}`}>
                  {sla.label}
                </span>
              </div>
              <div className="meter mt-1">
                <span className={`block h-full rounded-full ${sla.breached ? "bg-rose-500" : sla.fraction >= 0.7 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(2, Math.round(sla.fraction * 100))}%` }} />
              </div>
            </div>

            {/* Lifecycle stepper */}
            <div>
              <p className="label">Resolution lifecycle</p>
              <ol className="mt-2 space-y-0">
                {STAGES.map((st, i) => {
                  const done = i <= stage;
                  return (
                    <li key={st.key} className="relative flex items-center gap-3 pb-3 last:pb-0">
                      {i < STAGES.length - 1 && (
                        <span aria-hidden className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5 ${i < stage ? "bg-emerald-500" : "bg-slate-200"}`} />
                      )}
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${done ? "bg-emerald-500 text-white" : "border-2 border-slate-300 bg-white text-transparent"}`}>
                        ✓
                      </span>
                      <span className={`text-xs font-semibold ${done ? "text-ink-900" : "text-slate-400"}`}>{st.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Field proof */}
            {complaint.resolvedAt && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Field proof</p>
                <p className="mt-1 text-xs text-emerald-900">{complaint.resolvedNotes}</p>
                {complaint.resolvedPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={complaint.resolvedPhotoUrl} alt={`After photo #${complaint.id}`} className="mt-2 h-40 w-full rounded-lg border border-emerald-200 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <p className="mt-1.5 text-[11px] text-emerald-600">
                  Submitted {new Date(complaint.resolvedAt).toLocaleString()} ·{" "}
                  {complaint.verified ? `verified by ${complaint.verifiedBy ?? "ward officer"}` : "awaiting officer verification"}
                </p>
              </div>
            )}

            {complaint.imageUrl && (
              <div>
                <p className="label">Citizen evidence</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={complaint.imageUrl} alt={`Evidence #${complaint.id}`} className="mt-1 h-40 w-full rounded-lg border border-slate-200 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
