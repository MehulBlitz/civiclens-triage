"use client";

import { useEffect, useMemo, useState } from "react";
import type { Complaint, Ward, User } from "@/lib/schema";
import type { Stats } from "@/lib/queries";
import { STATUSES } from "@/lib/civic";

type AdminData = { user: User; complaints: Complaint[]; stats: Stats; wards: Ward[] };

const emptyWard = { code: "", name: "", zone: "" };

export default function AdminWorkspace() {
  const [data, setData] = useState<AdminData | null>(null);
  const [ward, setWard] = useState(emptyWard);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin", { cache: "no-store" });
    const next = (await response.json()) as AdminData & { error?: string };
    if (!response.ok) throw new Error(next.error ?? "Could not load administration data");
    setData(next);
  };

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load data")); }, []);

  const open = useMemo(() => data?.complaints.filter((c) => c.status !== "resolved" && c.status !== "verified").length ?? 0, [data]);
  const changeStatus = async (id: number, status: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/complaints/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Status update failed");
      setNotice(`Complaint #${id} moved to ${status.replaceAll("_", " ")}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Status update failed"); }
    finally { setBusy(false); }
  };

  const create = async (payload: Record<string, unknown>, reset: () => void) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save record");
      reset(); setNotice("Saved to the database."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save record"); }
    finally { setBusy(false); }
  };

  if (!data) return <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-ink-500">Loading administration workspace…</div>;

  return (
    <div className="space-y-5">
      <header className="card flex flex-wrap items-center justify-between gap-4 bg-civic-950 px-5 py-5 text-white">
        <div><p className="label text-amber-300">Administrator workspace</p><h1 className="mt-1 text-2xl font-black">City operations, without the demo numbers</h1><p className="mt-1 text-sm text-civic-200">Signed in as {data.user.email}. Every count below is calculated from Postgres.</p></div>
        <button type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => { window.location.href = "/login"; })} className="btn-tactile min-h-touch border-white/20 bg-white/10 text-white">Sign out</button>
      </header>
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['Total complaints', data.stats.total], ['Open queue', open], ['Urgent', data.stats.urgent], ['Wards', data.wards.length], ['Located', data.stats.located]].map(([label, value]) => <div key={label} className="card px-4 py-4"><p className="label">{label}</p><p className="mt-2 text-3xl font-black text-ink-900">{value}</p></div>)}
      </section>

      <section className="card overflow-hidden"><div className="border-b border-[color:var(--line)] px-5 py-4"><h2 className="font-bold text-ink-900">Complaint lifecycle</h2><p className="mt-1 text-xs text-ink-500">Only administrators can advance status; the queue and aggregate metrics update from the same records.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[color:var(--paper-sunken)] text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-5 py-3">Complaint</th><th className="px-3 py-3">Ward/location</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{data.complaints.slice(0, 30).map((complaint) => <tr key={complaint.id} className="border-t border-[color:var(--line)]"><td className="max-w-md px-5 py-3"><span className="font-mono text-xs text-ink-400">#{complaint.id}</span><p className="mt-1 font-medium text-ink-900">{complaint.summary}</p></td><td className="px-3 py-3 text-xs text-ink-500">{complaint.locationText ?? "Unlocated"}</td><td className="px-3 py-3 text-xs font-bold uppercase">{complaint.priority}</td><td className="px-3 py-3"><select value={complaint.status} disabled={busy} onChange={(e) => void changeStatus(complaint.id, e.target.value)} className="rounded-lg border border-[color:var(--line-strong)] bg-white px-2 py-2 text-xs font-semibold"><option value={complaint.status}>{complaint.status.replaceAll("_", " ")}</option>{STATUSES.filter((status) => status !== complaint.status).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></td></tr>)}</tbody></table></div></section>

      <section className="card space-y-3 p-5"><div><h2 className="font-bold text-ink-900">Manage neutral ward coverage</h2><p className="mt-1 text-xs text-ink-500">Ward records provide routing, map filters, SLA reporting, and citizen-facing locality context.</p></div><form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void create({ type: "ward", ...ward }, () => setWard(emptyWard)); }}>{([['code','Code'],['name','Name'],['zone','Zone']] as const).map(([key, label]) => <label key={key} className="label">{label}<input required value={ward[key]} onChange={(e) => setWard({ ...ward, [key]: e.target.value })} className="mt-1 min-h-touch w-full rounded-lg border border-[color:var(--line-strong)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-ink-900" /></label>)}<button disabled={busy} className="btn-tactile btn-tactile-primary min-h-touch self-end">Save ward</button></form></section>
    </div>
  );
}