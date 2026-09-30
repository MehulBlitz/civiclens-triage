"use client";

import { useCallback, useEffect, useState } from "react";
import type { Complaint } from "@/lib/schema";
import { PRIORITY_STYLE, slaState } from "@/lib/civic";
import { useCivic } from "@/components/CivicProvider";

/**
 * Ward-officer governance portal: auto-dispatch open complaints to the
 * least-loaded matching crew, then review submitted resolution proofs —
 * verify & close, or reject and demand rework. Verification feeds the
 * SLA compliance stats and the contractor ledger.
 */
export default function OfficerPage() {
  const { refresh } = useCivic();
  const [rows, setRows] = useState<Complaint[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"dispatch" | "proofs">("dispatch");

  const load = useCallback(async () => {
    try {
      const data = (await fetch("/api/complaints", { cache: "no-store" }).then((r) => r.json())) as {
        complaints?: Complaint[];
      };
      setRows(data.complaints ?? []);
    } catch {
      setError("Could not load complaints.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = rows.filter((c) => c.status === "open");
  const pendingProofs = rows.filter((c) => c.status === "resolved" && !c.verified && c.resolvedAt);
  const verified = rows.filter((c) => c.verified);

  const dispatch = async (c: Complaint) => {
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: c.id })
      });
      const data = (await res.json()) as { worker?: { name: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Dispatch failed");
      setNote(`✓ #${c.id} dispatched to ${data.worker?.name ?? "field crew"}.`);
      await load();
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispatch failed");
    } finally {
      setBusy(null);
    }
  };

  const dispatchAll = async () => {
    for (const c of open.slice(0, 10)) {
      // eslint-disable-next-line no-await-in-loop
      await dispatch(c);
    }
  };

  const verify = async (c: Complaint, reject: boolean) => {
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: c.id, reject })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setNote(reject ? `↩ #${c.id} sent back for rework.` : `✓ #${c.id} verified & closed.`);
      await load();
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-black text-white">Ward officer portal</h1>
            <p className="mt-0.5 text-xs text-civic-200">
              Dispatch crews, verify field proof, and keep the 48-hour SLA honest. Every decision is logged.
            </p>
          </div>
          <div className="seg" role="tablist" aria-label="Officer view">
            <button type="button" data-active={tab === "dispatch"} onClick={() => setTab("dispatch")}>
              Dispatch ({open.length})
            </button>
            <button type="button" data-active={tab === "proofs"} onClick={() => setTab("proofs")}>
              Proof review ({pendingProofs.length})
            </button>
          </div>
        </div>
      </section>

      {note && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{note}</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

      {tab === "dispatch" ? (
        <section className="card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Undispatched complaints</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Auto-routing matches the department and picks the least-loaded crew.
              </p>
            </div>
            {open.length > 1 && (
              <button type="button" onClick={() => void dispatchAll()} className="btn-tactile btn-tactile-primary min-h-touch text-xs" disabled={busy !== null}>
                ⚡ Auto-dispatch all ({Math.min(open.length, 10)})
              </button>
            )}
          </div>
          {open.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Every complaint has a crew. Check the proof review tab.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {open.map((c) => {
                const p = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
                const sla = slaState(c.priority, c.createdAt, c.status);
                return (
                  <li key={c.id} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`chip ${p.chip}`}>{p.label}</span>
                      <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">{c.category}</span>
                      <span className={`text-[11px] font-semibold ${sla.breached ? "text-rose-600" : "text-ink-400"}`}>{sla.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink-900">{c.summary}</p>
                    <p className="mt-0.5 text-[11px] text-ink-500">→ {c.routeTo} · {c.locationText ?? "no location"}</p>
                    <button type="button" onClick={() => void dispatch(c)} disabled={busy === c.id} className="btn-tactile btn-tactile-primary min-h-touch mt-2 px-3 py-2 text-xs">
                      {busy === c.id ? "Dispatching…" : "🚚 Dispatch to crew"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="card px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-ink-900">Resolution proofs awaiting verification</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Check the after-photo and work notes. Verify to close officially, or reject for rework.
          </p>
          {pendingProofs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No proofs waiting. Field crews are still working.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pendingProofs.map((c) => {
                const p = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
                return (
                  <li key={c.id} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`chip ${p.chip}`}>{p.label}</span>
                      <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">{c.category}</span>
                      <span className="text-[11px] text-ink-400">
                        crew: {c.assignedWorkerName ?? "unassigned"} · resolved {c.resolvedAt ? new Date(c.resolvedAt).toLocaleString() : "—"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-ink-900">{c.summary}</p>
                    <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-ink-700">
                      <span className="font-bold">Work notes:</span> {c.resolvedNotes}
                    </p>
                    {c.resolvedPhotoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.resolvedPhotoUrl} alt={`After photo for #${c.id}`} className="mt-2 h-40 w-full rounded-lg border border-slate-200 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void verify(c, false)} disabled={busy === c.id} className="btn-tactile min-h-touch border-emerald-400 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                        ✓ Verify &amp; close
                      </button>
                      <button type="button" onClick={() => void verify(c, true)} disabled={busy === c.id} className="btn-tactile min-h-touch border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                        ↩ Reject — rework
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {verified.length > 0 && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-ink-500">
              <b className="text-ink-900">{verified.length}</b> resolutions officially verified — feeds the SLA compliance ledger.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
