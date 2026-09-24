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
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-civic-400 focus:outline-none"
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

  return (
    <section className="card px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
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
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-civic-400 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Search
          <input
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="text, landmark, locality…"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-civic-400 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700"
        >
          Reset
        </button>
        <span className="ml-auto pb-1.5 text-xs font-semibold text-slate-500">
          {filtered.length} / {complaints.length} shown
        </span>
      </div>
    </section>
  );
}
