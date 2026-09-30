"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const FAQS = [
  {
    q: "What civic problems can I report here?",
    a: "Potholes and road damage, clogged storm drains and waterlogging, uncollected garbage, water leaks and no supply, dead streetlights, sewage overflow, illegal posters/graffiti — plus anything else under 'Other'. The AI classifies 8 categories automatically."
  },
  {
    q: "How does the AI triage my complaint?",
    a: "Your raw text runs through a three-layer pipeline: (L1) a self-hosted scikit-learn SVM trained on real 311 open data classifies category and priority; (L2) an in-process keyword engine takes over if the model is down; (L3) anything ambiguous lands in a human review queue. Photos are analyzed by a from-scratch CNN plus image forensics (EXIF, tamper detection, perceptual hashing)."
  },
  {
    q: "What is the SLA and how is it enforced?",
    a: "Urgent complaints carry a 24-hour clock, high 72 h, medium 7 days, low 14 days. Clocks are visible on every ticket. Field crews submit before/after proof, and ward officers verify — unverified closures are visible to everyone."
  },
  {
    q: "How do I get a field crew dispatched faster?",
    a: "Attach a photo (evidence raises trust and priority), share a precise location (GPS or landmark), and encourage neighbors to co-sign the complaint — five co-signatures auto-escalate the priority. You can also escalate to your ward corporator via WhatsApp from the Representatives page."
  },
  {
    q: "What is Civic Karma and how do I earn it?",
    a: "Points for civic participation: +10 for a report, +5 for photo evidence, +20 when your evidence leads to verified resolution, +2 per co-sign. Tiers run Rookie → Civic Legend, and the ledger is public."
  },
  {
    q: "Is my photo analyzed for authenticity?",
    a: "Yes — evidence photos pass through forensics: EXIF integrity, error-level (tamper) analysis and a 64-bit perceptual hash that recognizes reused photos. Low-trust evidence routes the complaint to human review instead of auto-dispatch."
  },
  {
    q: "Do I need an account?",
    a: "No. Complaints are public and trackable by ticket number on the Track page. Submitting anonymously is always an option."
  },
  {
    q: "Does the AI work offline or without external APIs?",
    a: "Everything critical is self-hosted: the models train and run inside the project (Docker images included), geocoding uses free OpenStreetMap Nominatim, and weather uses Open-Meteo. If any layer fails, the next layer takes over — the app never hard-fails."
  }
];

const QUICK_LINKS = [
  { href: "/quick", label: "Snap & Send report", icon: "⚡", hint: "10-second intake" },
  { href: "/track", label: "Track a ticket", icon: "🔍", hint: "no login needed" },
  { href: "/karma", label: "Civic Karma", icon: "🌟", hint: "earn & redeem" },
  { href: "/representatives", label: "My representative", icon: "🏛", hint: "escalate via WhatsApp" }
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-5 py-4">
          <h1 className="text-lg font-black text-white">Help &amp; FAQ</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            How the AI triage works, how SLAs are enforced, and how to get things fixed faster.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="card group flex flex-col items-center gap-1 px-3 py-4 text-center transition hover:shadow-lift"
          >
            <span className="text-2xl" aria-hidden>{l.icon}</span>
            <span className="text-xs font-bold text-ink-900 group-hover:text-civic-700">{l.label}</span>
            <span className="text-[10px] text-ink-400">{l.hint}</span>
          </Link>
        ))}
      </div>

      <section className="card px-4 py-4 sm:px-5">
        <label className="label" htmlFor="faq-search">Search answers</label>
        <input
          id="faq-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try “SLA”, “karma”, “photo”…"
          className="well mt-1 w-full text-sm"
        />
      </section>

      <section className="space-y-2.5">
        {filtered.map((f, i) => {
          const open = openIdx === i;
          return (
            <article key={f.q} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-sm font-bold text-ink-900">{f.q}</span>
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {open && <p className="border-t border-[color:var(--line)] px-4 py-3 text-sm leading-relaxed text-ink-700">{f.a}</p>}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No answers match “{query}”.</p>
        )}
      </section>
    </div>
  );
}
