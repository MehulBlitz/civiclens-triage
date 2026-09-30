import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { pulseDot } from "../lib/anime";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/nagarsevak", label: "Nagarsevak" },
  { to: "/report", label: "Report" },
  { to: "/track", label: "Track" },
  { to: "/karma", label: "Karma" },
];

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0d2129" />
        <path d="M12 40c6-10 10-10 16 0s10 10 16 0" stroke="#fe7f11" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="20" r="7" fill="#ffc071" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-tide-950">
        Civic<span className="text-saffron-600">Lens</span>
        <span className="ml-1.5 rounded bg-tide-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-tide-700">
          Mumbai
        </span>
      </span>
    </span>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const dotRef = useRef<HTMLSpanElement>(null);
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => pulseDot(dotRef.current), []);

  return (
    <header className="sticky top-0 z-40 border-b border-tide-200/80 bg-tide-50/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="CivicLens Mumbai home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `min-h-touch rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-tide-950 text-tide-50" : "text-tide-700 hover:bg-tide-100"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 lg:inline-flex">
            <span ref={dotRef} className="h-2 w-2 rounded-full bg-emerald-500" />
            BMC corpus v2 live
          </span>
        </nav>

        <button
          className="min-h-touch rounded-lg border border-tide-300 px-3 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <nav className="border-t border-tide-200 bg-white px-4 py-2 md:hidden" aria-label="Mobile">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-3 text-sm font-medium ${
                  isActive ? "bg-tide-950 text-tide-50" : "text-tide-700"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-tide-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Logo />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-tide-600">
              AI civic complaint triage for Brihanmumbai Municipal Corporation wards —
              client-side lexicon distilled from the BMC/Mumbai corpus, nagarsevak
              accountability and monsoon SLA tracking. Static build: no server, no login.
            </p>
          </div>
          <div className="flex gap-2 text-xs text-tide-500">
            <span className="chip border-tide-200 bg-tide-50">Built for the BMC hackathon</span>
            <span className="chip border-saffron-200 bg-saffron-50">BMC corpus v2</span>
          </div>
        </div>
        <p className="mt-8 text-xs text-tide-400">
          Demo dataset for representative rows · Real ward/zone structure of MCGM ·
          The full-stack ML app lives in the main repository.
        </p>
      </div>
    </footer>
  );
}
