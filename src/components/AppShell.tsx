"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCivic } from "./CivicProvider";
import SystemHealth from "./SystemHealth";
import CommandPalette from "./CommandPalette";

const NAV = [
  {
    href: "/",
    label: "Overview",
    short: "Home",
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
    short: "Map",
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
    short: "Risk",
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
    href: "/radar",
    label: "Radar",
    short: "Radar",
    hint: "Monsoon & flood watch",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M4.9 7l1.4 1.4m11.4 9.2 1.4 1.4M3 12h2m14 0h2M4.9 17l1.4-1.4M17.7 8.4l1.4-1.4" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    ),
  },
  {
    href: "/karma",
    label: "Civic Karma",
    short: "Karma",
    hint: "Citizen rewards & leaderboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8-4.2-4.1 5.9-.9L12 3Z" />
      </svg>
    ),
  },
  {
    href: "/insights",
    label: "Insights",
    short: "Insights",
    hint: "Duplicates, flooding, forecast, analytics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 16v-5m5 5V8m5 8v-3" />
      </svg>
    ),
  },
  {
    href: "/officer",
    label: "Officer",
    short: "Officer",
    hint: "Dispatch & verify resolutions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4 6.5V11c0 5 3.4 8.4 8 9.5 4.6-1.1 8-4.5 8-9.5V6.5L12 3Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/worker",
    label: "Crew",
    short: "Crew",
    hint: "Field crew tasks & proof",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7Z" />
      </svg>
    ),
  },
  {
    href: "/channels",
    label: "Channels",
    short: "Channels",
    hint: "WhatsApp / X / News signal ingestion",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    short: "Admin",
    hint: "Ward administration and lifecycle controls",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4 6.5V11c0 5 3.4 8.4 8 9.5 4.6-1.1 8-4.5 8-9.5V6.5L12 3Z" />
        <path strokeLinecap="round" d="M9 12h6M12 9v6" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { stats, refreshing, refresh } = useCivic();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // ⌘K / Ctrl-K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { user?: { email: string; role: string } | null }) => setUser(data.user ?? null))
      .catch(() => setUser(null));
  }, []);

  return (
    <div className="min-h-screen">
      {/* ============ MOBILE TOP BAR (sticky) ============ */}
      <div className="sticky top-0 z-40 lg:hidden">
        <header className="flex items-center gap-3 bg-civic-950 px-4 pb-2.5 pt-[max(0.65rem,env(safe-area-inset-top))] text-white shadow-lg">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-civic-950 shadow">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Zm0 4.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 12.2c-2 0-3.8-1-5-2.6.1-1.6 3.3-2.5 5-2.5s4.9.9 5 2.5c-1.2 1.6-3 2.6-5 2.6Z" />
              </svg>
            </span>
            <span>
              <span className="block text-base font-black leading-tight tracking-tight">CivicLens</span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300">
                Smarter cities
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm transition active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh data"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm transition active:scale-95 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
              </svg>
            </button>
            <a
              href="/api/export"
              download="civiclens-complaints.csv"
              aria-label="Export CSV"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 transition active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
              </svg>
            </a>
          </div>
        </header>
      </div>

      {/* ============ DESKTOP HEADER (unchanged instrument panel) ============ */}
      <header className="relative hidden overflow-hidden bg-civic-950 text-white lg:block">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 0%, rgba(42,128,169,0.55), transparent 45%), radial-gradient(circle at 85% 10%, rgba(245,158,11,0.35), transparent 40%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 42px 42px, 42px 42px",
          }}
        />
        <div className="relative mx-auto max-w-[1440px] px-6 pb-3 pt-6">
          <div className="flex items-center justify-between gap-6">
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-white/30 hover:text-white"
                title="Global search — ⌘K"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="m20 20-3.5-3.5" />
                </svg>
                Search
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold">⌘K</kbd>
              </button>
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
              <Link
                href={user?.role === "admin" ? "/admin" : "/login"}
                className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-white/10"
              >
                {user?.role === "admin" ? "Admin workspace" : user ? user.email : "Citizen sign in"}
              </Link>
            </div>
          </div>

          {/* Desktop page navigation */}
          <nav className="mt-4 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.hint}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  isActive(item.href)
                    ? "bg-amber-400 text-civic-950 shadow"
                    : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* ============ CONTENT ============ */}
      <main className="mx-auto max-w-[1440px] px-4 py-4 pb-24 sm:px-5 lg:px-6 lg:pb-6 lg:py-6">
        {children}
      </main>

      {/* ============ MOBILE BOTTOM TAB BAR ============ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-civic-950/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {NAV.slice(0, 5).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide transition active:scale-95 ${
                  active ? "text-amber-300" : "text-slate-400 active:text-white"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-amber-400"
                  />
                )}
                <span className={active ? "scale-110 transition-transform" : "transition-transform"}>
                  {item.icon}
                </span>
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ============ MOBILE MORE MENU (drawer for secondary pages) ============ */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ============ DESKTOP FOOTER ============ */}
      <footer className="mx-auto hidden max-w-[1440px] px-6 pb-10 pt-2 text-center text-xs text-slate-400 lg:block">
        CivicLens · three-layer fallback triage (ML model → lexical rules →
        manual review) · Civic Incident NN risk engine · 3D digital twin ·
        WhatsApp / X / News channels · Leaflet + OpenStreetMap + Nominatim ·
        Postgres via Neon · citizen sign-in · role-gated administration.
      </footer>
    </div>
  );
}
