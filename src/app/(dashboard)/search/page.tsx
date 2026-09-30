"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PRIORITY_STYLE, STATUS_STYLE } from "@/lib/civic";

type SearchRow = {
  id: number;
  summary: string;
  category: string;
  priority: string;
  status: string;
  locationText: string | null;
  routeTo: string;
};

function SearchInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      const data = (await res.json()) as { results?: SearchRow[] };
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = params.get("q");
    if (q) void run(q);
  }, [params, run]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="card overflow-hidden bg-civic-950">
        <div className="px-5 py-4">
          <h1 className="text-lg font-black text-white">Search grievances</h1>
          <p className="mt-0.5 text-xs text-civic-200">
            Search across every ticket by keyword, ward, category or department.
          </p>
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
        className="card flex gap-2 px-4 py-4"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="pothole Indiranagar, garbage HSR…"
          className="well min-w-0 flex-1 text-sm"
        />
        <button type="submit" className="btn-tactile btn-tactile-primary min-h-touch px-4 py-2 text-sm font-bold">
          Search
        </button>
      </form>

      {loading && <p className="text-center text-sm text-slate-400">Searching…</p>}
      {!loading && results.length === 0 && query.trim().length >= 2 && (
        <p className="py-8 text-center text-sm text-slate-500">No tickets match “{query}”.</p>
      )}

      <ul className="space-y-2.5">
        {results.map((r) => {
          const p = PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.medium;
          const s = STATUS_STYLE[r.status];
          return (
            <li key={r.id}>
              <Link href={`/track?id=${r.id}`} className="card block px-4 py-3 transition hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`chip ${p.chip}`}>{p.label}</span>
                  <span className="rounded-full bg-[color:var(--paper-sunken)] px-2 py-0.5 text-[11px] font-semibold text-ink-700">{r.category}</span>
                  <span className={`chip ${s?.chip ?? ""}`}>{s?.label ?? r.status}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-ink-900">#{r.id} · {r.summary}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">{r.locationText ?? "no location"} · → {r.routeTo}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-slate-400">Loading…</p>}>
      <SearchInner />
    </Suspense>
  );
}
