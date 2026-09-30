"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchRow = {
  id: number;
  summary: string;
  category: string;
  priority: string;
  status: string;
  locationText: string | null;
  routeTo: string;
};

const NAV_TARGETS = [
  { href: "/", label: "Overview — triage queue" },
  { href: "/quick", label: "Snap & Send — 10-second report" },
  { href: "/map", label: "Live map & digital twin" },
  { href: "/risk", label: "Risk engine (neural net)" },
  { href: "/radar", label: "Monsoon & flood radar" },
  { href: "/insights", label: "Insights & analytics" },
  { href: "/karma", label: "Civic Karma leaderboard" },
  { href: "/representatives", label: "My ward representative" },
  { href: "/worker", label: "Field crew portal" },
  { href: "/officer", label: "Ward officer portal" },
  { href: "/track", label: "Track a ticket" },
  { href: "/channels", label: "Signal channels" },
  { href: "/help", label: "Help & FAQ" }
];

/**
 * ⌘K / Ctrl-K command palette — global complaint search + page jump.
 * Keyboard-first (arrows + enter), fully usable with the mouse too.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Global search (debounced).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = (await res.json()) as { results?: SearchRow[] };
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const navMatches = query.trim()
    ? NAV_TARGETS.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4)
    : NAV_TARGETS.slice(0, 5);

  const flat = [
    ...navMatches.map((n) => ({ type: "nav" as const, ...n })),
    ...results.map((r) => ({
      type: "ticket" as const,
      href: `/track?id=${r.id}`,
      label: `#${r.id} · ${r.summary}`,
      category: r.category,
      priority: r.priority
    }))
  ];

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && flat[cursor]) {
      go(flat[cursor].href);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Close palette" className="fixed inset-0 z-[60] bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed left-1/2 top-[12%] z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search tickets, or jump to a page… (↑↓ · Enter · Esc)"
          className="w-full border-b border-[color:var(--line)] px-4 py-3.5 text-sm font-medium text-ink-900 placeholder:text-ink-300 focus:outline-none"
        />
        <ul className="max-h-[380px] overflow-y-auto p-2">
          {navMatches.length > 0 && (
            <li className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Pages</li>
          )}
          {navMatches.map((n, i) => (
            <li key={n.href}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(n.href)}
                data-active={cursor === i}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${cursor === i ? "bg-civic-50 text-civic-900" : "text-ink-700"}`}
              >
                <span aria-hidden>→</span>
                {n.label}
              </button>
            </li>
          ))}
          {results.length > 0 && (
            <li className="px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Tickets</li>
          )}
          {results.map((r, ri) => {
            const idx = navMatches.length + ri;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() => go(`/track?id=${r.id}`)}
                  className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left ${cursor === idx ? "bg-civic-50" : ""}`}
                >
                  <span className="truncate text-sm font-semibold text-ink-900">
                    #{r.id} · {r.summary}
                  </span>
                  <span className="text-[11px] text-ink-500">
                    {r.category} · {r.status.replace(/_/g, " ")} · {r.locationText ?? "no location"}
                  </span>
                </button>
              </li>
            );
          })}
          {flat.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">Nothing found — try a different phrase.</li>
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-[color:var(--line)] bg-slate-50 px-4 py-2 text-[10px] font-semibold text-ink-400">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>CivicLens ⌘K</span>
        </div>
      </div>
    </>
  );
}
