"use client";

import { useMemo, useState } from "react";
import { PARTIES, REPRESENTATIVES, ZONES, whatsappEscalationUrl } from "@/lib/representatives";

/**
 * Find-your-representative directory (nagarsevak / ward corporator):
 * searchable + filterable, with accountability metrics and one-tap
 * WhatsApp escalation pre-filled with a complaint reference.
 */
export default function RepresentativesPage() {
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("All");
  const [party, setParty] = useState("All");
  const [ticketId, setTicketId] = useState("");
  const [summary, setSummary] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REPRESENTATIVES.filter((r) => {
      if (zone !== "All" && r.zone !== zone) return false;
      if (party !== "All" && r.party !== party) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.ward.toLowerCase().includes(q) &&
        !r.party.toLowerCase().includes(q)
      )
        return false;
      return true;
    }).sort((a, b) => b.slaCompliance - a.slaCompliance);
  }, [query, zone, party]);

  const selectedRep = filtered[0] ?? REPRESENTATIVES[0];
  const ticket = Number.parseInt(ticketId, 10);

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-4 py-4 sm:px-6">
          <h1 className="text-lg font-black text-white">Find your ward representative</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            Corporators hold departments accountable. Every profile shows public response metrics —
            and you can escalate any complaint to their official WhatsApp with one tap.
          </p>
        </div>
      </section>

      <section className="card px-4 py-4 sm:px-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500 sm:col-span-2">
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, ward, neighborhood or party…"
              className="well mt-0 w-full text-sm font-medium text-ink-900 placeholder:text-ink-300 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Zone
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="well w-full text-sm text-ink-900">
              {ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Party
            <select value={party} onChange={(e) => setParty(e.target.value)} className="well w-full text-sm text-ink-900">
              {PARTIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Escalation builder — pick a ticket, generate the WhatsApp deep link */}
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-3">
          <p className="label">Escalate a complaint to {selectedRep?.name ?? "the representative"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ticket #"
              inputMode="numeric"
              className="well w-24 text-sm"
            />
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What is the issue? (short summary)"
              className="well min-w-[180px] flex-1 text-sm"
            />
            {selectedRep && Number.isInteger(ticket) && ticket > 0 && (
              <a
                href={whatsappEscalationUrl(selectedRep, ticket, summary || "Civic complaint pending action", "Ward area")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-tactile min-h-touch border-emerald-600 bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                ⌁ Escalate via WhatsApp
              </a>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-emerald-700">
            The message is pre-filled with the ticket ID, issue text and SLA note — representatives reply to specifics.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <article key={r.id} className="card flex flex-col gap-3 px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-ink-900">{r.name}</h2>
                <p className="truncate text-xs text-ink-500">{r.ward}</p>
              </div>
              <span className="chip shrink-0 border-civic-200 bg-civic-50 text-civic-700">{r.party}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 px-1.5 py-2">
                <p className="text-base font-black text-emerald-700">{r.complaintsResolved}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-500">resolved</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-1.5 py-2">
                <p className="text-base font-black text-amber-700">{r.complaintsOpen}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-amber-500">open</p>
              </div>
              <div className="rounded-lg bg-civic-50 px-1.5 py-2">
                <p className="text-base font-black text-civic-700">{r.avgResponseHours.toFixed(1)}h</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-civic-500">avg reply</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-ink-500">
                <span>SLA compliance</span>
                <span className={r.slaCompliance >= 0.85 ? "text-emerald-600" : r.slaCompliance >= 0.75 ? "text-amber-600" : "text-rose-600"}>
                  {Math.round(r.slaCompliance * 100)}%
                </span>
              </div>
              <div className="meter mt-1">
                <span
                  className={`block h-full rounded-full ${r.slaCompliance >= 0.85 ? "bg-emerald-500" : r.slaCompliance >= 0.75 ? "bg-amber-500" : "bg-rose-500"}`}
                  style={{ width: `${Math.round(r.slaCompliance * 100)}%` }}
                />
              </div>
            </div>

            <div className="mt-auto space-y-1 text-[11px] text-ink-500">
              <p className="truncate">🏢 {r.office}</p>
              <p className="truncate">☎ {r.phone} · ✉ {r.email}</p>
              <p>Term {r.term} · Response rate {Math.round(r.responseRate * 100)}%</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={whatsappEscalationUrl(r, Number.isInteger(ticket) && ticket > 0 ? ticket : 0, summary || "Ward civic issue", r.ward)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-tactile min-h-touch flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                ⌁ WhatsApp
              </a>
              <a href={`tel:${r.phone}`} className="btn-tactile min-h-touch flex-1">
                ☎ Call office
              </a>
            </div>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-500">
            No representatives match these filters — try clearing the search.
          </p>
        )}
      </div>
    </div>
  );
}
