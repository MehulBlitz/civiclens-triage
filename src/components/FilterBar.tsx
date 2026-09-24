"use client";

import { useCivic } from "./CivicProvider";

function Select({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-touch rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-civic-400 focus:outline-none sm:py-1.5"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function FilterBar() {
  const { filters, setFilters, resetFilters, categories, departments, filtered, complaints } =
    useCivic();

  const activeCount =
    (filters.priority !== "all" ? 1 : 0) +
    (filters.category !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.department !== "all" ? 1 : 0) +
    (filters.query ? 1 : 0);

  return (
    <section className="card px-3.5 py-3 sm:px-4">
      {/* Search always full width and first on mobile — highest-value control */}
      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Search
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Search text, landmark, locality…"
            inputMode="search"
            className="min-h-touch w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:border-civic-400 focus:outline-none sm:text-xs"
          />
          {filters.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setFilters((f) => ({ ...f, query: "" }))}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3" aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
      </label>

      {/* Selects: 2-col grid on mobile → inline row on desktop */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        <Select
          label="Priority"
          value={filters.priority}
          options={["urgent", "high", "medium", "low"]}
          onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
        />
        <Select
          label="Category"
          value={filters.category}
          options={categories}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
        />
        <Select
          label="Status"
          value={filters.status}
          options={["open", "in_progress", "resolved", "needs_review"]}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        />
        <Select
          label="Department"
          value={filters.department}
          options={departments}
          onChange={(v) => setFilters((f) => ({ ...f, department: v }))}
        />
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Sort
          <select
            value={filters.sort}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                sort: e.target.value as typeof filters.sort
              }))
            }
            className="min-h-touch rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-civic-400 focus:outline-none sm:py-1.5"
          >
            <option value="newest">Newest</option>
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={resetFilters}
          disabled={activeCount === 0}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-40"
        >
          Reset{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <span className="text-xs font-semibold text-slate-500">
          {filtered.length} / {complaints.length} shown
        </span>
      </div>
    </section>
  );
}
