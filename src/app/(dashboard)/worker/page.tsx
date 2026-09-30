"use client";

import { useCallback, useEffect, useState } from "react";
import type { Complaint, Worker } from "@/lib/schema";
import { PRIORITY_STYLE, slaState } from "@/lib/civic";

/**
 * Field-crew portal: the ground worker sees the open pool, claims a task
 * (open → assigned), and submits resolution proof (assigned → resolved,
 * pending officer verification). Zero paperwork — everything is a tap.
 */
export default function WorkerPage() {
  const [pool, setPool] = useState<Complaint[]>([]);
  const [crew, setCrew] = useState<Worker[]>([]);
  const [me, setMe] = useState<Worker | null>(null);
  const [mine, setMine] = useState<Complaint[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<Complaint | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assign", { cache: "no-store" });
      const data = (await res.json()) as { pool?: Complaint[]; workers?: Worker[] };
      setPool(data.pool ?? []);
      setCrew(data.workers ?? []);
      const all = await fetch("/api/complaints", { cache: "no-store" }).then((r) => r.json());
      const rows = (all.complaints ?? []) as Complaint[];
      if (me) {
        setMine(rows.filter((c) => c.assignedWorkerId === me.id && c.status !== "resolved"));
      }
    } catch {
      setError("Could not load the dispatch pool.");
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (c: Complaint) => {
    if (!me) return;
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: c.id, workerId: me.id })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Claim failed");
      setNote(`✓ Task #${c.id} assigned to you.`);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  };

  const submitProof = async () => {
    if (!proofFor) return;
    setBusy(proofFor.id);
    setError(null);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintId: proofFor.id,
          resolvedPhotoUrl: photoUrl.trim() || null,
          resolvedNotes: notes
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setNote(`✓ Resolution proof for #${proofFor.id} submitted — awaiting officer verification.`);
      setProofFor(null);
      setPhotoUrl("");
      setNotes("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-4 py-4 sm:px-6">
          <h1 className="text-lg font-black text-white">Field crew portal</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            Claim tasks from the open pool, fix the issue on the ground, and submit before/after proof.
            Verified resolutions build your rating — zero paperwork.
          </p>
        </div>
      </section>

      {/* Crew picker (demo auth) */}
      <section className="card px-4 py-3.5 sm:px-5">
        <label className="label" htmlFor="worker-select">Working as</label>
        <select
          id="worker-select"
          value={me?.id ?? ""}
          onChange={(e) => {
            const w = crew.find((x) => x.id === Number(e.target.value)) ?? null;
            setMe(w);
            setMine([]);
          }}
          className="well mt-1 w-full text-sm sm:max-w-sm"
        >
          <option value="">— select a crew member —</option>
          {crew.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · {w.department} · {w.tasksDone} tasks · ★{w.rating}
            </option>
          ))}
        </select>
        {me && (
          <p className="mt-2 text-xs text-ink-500">
            {me.name} — {me.department}, Zone {me.zone}. Tasks completed: <b>{me.tasksDone}</b>.
          </p>
        )}
      </section>

      {note && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{note}</p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
      )}

      {me && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* My queue */}
          <section className="card px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-ink-900">My assigned tasks</h2>
            <p className="mt-0.5 text-xs text-ink-500">Submit proof when the fix is on the ground.</p>
            {mine.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nothing assigned to you right now.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {mine.map((c) => {
                  const p = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
                  const sla = slaState(c.priority, c.createdAt, c.status);
                  return (
                    <li key={c.id} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`chip ${p.chip}`}>{p.label}</span>
                        <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">{c.category}</span>
                        <span className="text-[11px] text-ink-400">{sla.label}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink-900">{c.summary}</p>
                      <p className="mt-0.5 text-[11px] text-ink-500">{c.locationText ?? "no location"}</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { setProofFor(c); setNotes(""); setPhotoUrl(""); }}
                          className="btn-tactile btn-tactile-primary min-h-touch px-3 py-2 text-xs"
                          disabled={busy === c.id}
                        >
                          📸 Submit resolution proof
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Open pool */}
          <section className="card px-4 py-4 sm:px-5">
            <h2 className="text-sm font-bold text-ink-900">Open pool</h2>
            <p className="mt-0.5 text-xs text-ink-500">Unassigned complaints — claim what you can reach fastest.</p>
            {pool.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Pool is clear. Nice work.</p>
            ) : (
              <ul className="mt-3 max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
                {pool.map((c) => {
                  const p = PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.medium;
                  return (
                    <li key={c.id} className="rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`chip ${p.chip}`}>{p.label}</span>
                        <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">{c.category}</span>
                        <span className="ml-auto text-[11px] text-ink-400">→ {c.routeTo}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink-900">{c.summary}</p>
                      <p className="mt-0.5 text-[11px] text-ink-500">{c.locationText ?? "no location"}</p>
                      <button
                        type="button"
                        onClick={() => void claim(c)}
                        disabled={busy === c.id}
                        className="btn-tactile min-h-touch mt-2 px-3 py-2 text-xs"
                      >
                        {busy === c.id ? "Claiming…" : "✋ Claim task"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Proof submission sheet */}
      {proofFor && (
        <>
          <button type="button" aria-label="Close proof form" className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[2px]" onClick={() => setProofFor(null)} />
          <section className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2" role="dialog" aria-label="Submit resolution proof">
            <h3 className="text-sm font-bold text-ink-900">Resolution proof · #{proofFor.id}</h3>
            <p className="mt-0.5 text-xs text-ink-500">{proofFor.summary}</p>
            <label className="label mt-3 block" htmlFor="proof-photo">After photo URL (optional but builds trust)</label>
            <input id="proof-photo" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…/after-repair.jpg" className="well mt-1 w-full text-sm" />
            <label className="label mt-3 block" htmlFor="proof-notes">Work notes (required)</label>
            <textarea id="proof-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Describe repairs completed, compaction, roller passes…" className="well mt-1 w-full text-sm" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void submitProof()} disabled={busy !== null || !notes.trim()} className="btn-tactile btn-tactile-amber min-h-touch flex-1 text-sm font-bold disabled:opacity-50">
                Submit &amp; certify
              </button>
              <button type="button" onClick={() => setProofFor(null)} className="btn-tactile min-h-touch text-sm">Cancel</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
