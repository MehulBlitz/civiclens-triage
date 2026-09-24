"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCivic } from "./CivicProvider";
import SystemHealth from "./SystemHealth";

const NAV = [
  {
    href: "/",
    label: "Overview",
    hint: "Triage queue, detail view and manual ingest",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "Live Map",
    hint: "Leaflet map + 3D civic digital twin",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/risk",
    label: "Risk Engine",
    hint: "Civic Incident NN — live activations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path strokeLinecap="round" d="M7.7 7.4 10.5 16M16.3 7.4 13.5 16M8 6h8" />
      </svg>
    ),
  },
  {
    href: "/insights",
    label: "Insights",
    hint: "Duplicates, flooding, forecast, analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 16v-5m5 5V8m5 8v-3" />
      </svg>
    ),
  },
  {
    href: "/channels",
    label: "Channels",
    hint: "WhatsApp / X / News signal ingestion",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { stats, refreshing, refresh } = useCivic();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative overflow-hidden bg-civic-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 0%, rgba(42,128,169,0.55), transparent 45%), radial-gradient(circle at 85% 10%, rgba(245,158,11,0.35), transparent 40%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 42px 42px, 42px 42px",
          }}
        />
        <div className="relative mx-auto max-w-[1440px] px-5 pb-3 pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/" className="group flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-civic-950 shadow-lg transition group-hover:scale-105">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                  <path d="M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Zm0 4.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 12.2c-2 0-3.8-1-5-2.6.1-1.6 3.3-2.5 5-2.5s4.9.9 5 2.5c-1.2 1.6-3 2.6-5 2.6Z" />
                </svg>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight sm:text-2xl">
                    CivicLens
                  </h1>
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                    Smarter Cities · Happier Citizens
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-civic-200">
                  Self-hosted ML triage + civic digital twin — classify, prioritize
                  and route complaints from raw text onto a living 3D map.
                </p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
                title="Live city activity — signals, clusters and resolutions flowing in realtime"
              >
                <span
                  className={`h-2 w-2 rounded-full animate-city-pulse ${
                    stats.urgent > 0 ? "!animate-urgent-pulse" : ""
                  }`}
                  style={{ background: stats.urgent > 0 ? "#e11d48" : "#4a9cc2" }}
                />
                CITY PULSE
              </span>
              <SystemHealth />
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                {refreshing ? "Syncing…" : "↻ Refresh"}
              </button>
              <a
                href="/api/export"
                download="civiclens-complaints.csv"
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300 transition hover:bg-amber-400/20"
                title="Download the full triage log as CSV"
              >
                ⤓ Export CSV
              </a>
            </div>
          </div>

          {/* Page navigation */}
          <nav className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-amber-400 text-civic-950 shadow"
                      : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-6">{children}</main>

      <footer className="mx-auto max-w-[1440px] px-5 pb-10 pt-2 text-center text-xs text-slate-400">
        CivicLens · three-layer fallback triage (ML model → lexical rules →
        manual review) · Civic Incident NN risk engine · 3D digital twin ·
        WhatsApp / X / News channels · Leaflet + OpenStreetMap + Nominatim ·
        Postgres via Neon · hackathon demo, no login required.
      </footer>
    </div>
  );
}
