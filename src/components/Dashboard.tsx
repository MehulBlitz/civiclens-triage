"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Complaint } from "@/lib/schema";
import type { LoadResult, Stats } from "@/lib/queries";
import type { Status } from "@/lib/civic";
import { PRIORITY_RANK } from "@/lib/civic";
import StatsStrip from "./StatsStrip";
import IngestPanel from "./IngestPanel";
import QueueList from "./QueueList";
import DetailPanel from "./DetailPanel";
import MapWrapper from "./MapWrapper";
import SystemHealth from "./SystemHealth";
import AnalyticsPanel from "./AnalyticsPanel";
import LiveFeed from "./LiveFeed";
import TwinWrapper from "./TwinWrapper";
import NeuralNetDiagram from "./NeuralNetDiagram";
import ChannelsPanel from "./ChannelsPanel";
import { predictRisk, type RiskPrediction } from "@/lib/nn/infer";
import {
  trafficLevelForHour,
  timeOfDayEncoding,
  type RiskFeatureInput,
} from "@/lib/nn/features";

type Filters = {
  priority: string;
  category: string;
  status: string;
  department: string;
  query: string;
  sort: "newest" | "priority" | "confidence";
};

const DEFAULT_FILTERS: Filters = {
  priority: "all",
  category: "all",
  status: "all",
  department: "all",
  query: "",
  sort: "newest"
};

const PIPELINE = [
  { step: "L1", label: "ML model (scikit-learn)", color: "#1f668c" },
  { step: "L2", label: "Lexical rules", color: "#059669" },
  { step: "L3", label: "Manual review", color: "#7c3aed" }
];

type Situation = {
  id: string;
  anchorId: number;
  category: string;
  priority: string;
  location: string | null;
  complaintCount: number;
  level: string;
  baselineLevel: string;
  sourceLayer: string;
  topSignals: { feature: string; label: string; value: number }[];
  explanation: string;
  rainfallMm: number | null;
  lat: number | null;
  lng: number | null;
  features: RiskFeatureInput;
};

const RISK_CHIP: Record<string, string> = {
  LOW: "border-sky-200 bg-sky-50 text-sky-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700"
};

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

export default function Dashboard({ initial }: { initial: LoadResult }) {
  const [complaints, setComplaints] = useState<Complaint[]>(initial.complaints);
  const [stats, setStats] = useState<Stats>(initial.stats);
  const [dbError, setDbError] = useState<string | null>(initial.dbError);
  const [selectedId, setSelectedId] = useState<number | null>(
    initial.complaints[0]?.id ?? null
  );
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Risk engine state (Civic Incident NN).
  const [situations, setSituations] = useState<Situation[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<RiskPrediction | null>(null);
  const [riskSource, setRiskSource] = useState<string>("—");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/complaints", { cache: "no-store" });
      const data = (await res.json()) as LoadResult;
      setComplaints(data.complaints);
      setStats(data.stats);
      setDbError(data.dbError);
      setSelectedId((current) =>
        data.complaints.some((c) => c.id === current)
          ? current
          : (data.complaints[0]?.id ?? null)
      );
    } catch (e) {
      setDbError(
        `Could not reach /api/complaints: ${e instanceof Error ? e.message : "unknown"}`
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const refreshRisk = useCallback(async () => {
    setRiskLoading(true);
    try {
      const res = await fetch("/api/risk", { cache: "no-store" });
      const data = (await res.json()) as {
        situations?: Situation[];
        error?: string;
      };
      setSituations(data.situations ?? []);
    } catch {
      // risk panel degrades silently — situations stay stale
    } finally {
      setRiskLoading(false);
    }
  }, []);

  // Refresh the risk engine whenever complaints change.
  useEffect(() => {
    void refreshRisk();
  }, [complaints, refreshRisk]);

  // Run the Civic Incident NN live for the selected complaint, client-side:
  // exact situation features when the selection anchors one, otherwise a
  // single-complaint feature vector. The diagram shows real activations.
  useEffect(() => {
    const selected = complaints.find((c) => c.id === selectedId);
    if (!selected) {
      setSelectedPrediction(null);
      setRiskSource("—");
      return;
    }
    const sit = situations.find((s) => s.anchorId === selected.id);
    if (sit?.features) {
      setSelectedPrediction(predictRisk(sit.features));
      setRiskSource(sit.sourceLayer || "neural_net");
      return;
    }
    const hour = new Date().getHours();
    const features: RiskFeatureInput = {
      complaintCount: selected.reportCount ?? 1,
      growthRate: 0,
      severity: Math.min(
        1,
        (PRIORITY_RANK[selected.priority] ?? 2) / 4 +
          (selected.escalatedAt ? 0.15 : 0)
      ),
      imageConfidence: selected.imageUrl ? Math.max(0.5, selected.confidence) : 0,
      accidentCount: /accident|fell|injur|crash/i.test(selected.rawText) ? 1 : 0,
      rainfall: 0,
      trafficLevel: trafficLevelForHour(hour),
      historicalIncidents: 0,
      distanceToPreviousIncident: 99,
      timeOfDay: timeOfDayEncoding(hour),
    };
    setSelectedPrediction(predictRisk(features));
    setRiskSource("neural_net");
  }, [selectedId, complaints, situations]);

  const onTriaged = useCallback(
    (created: Complaint[]) => {
      if (created[0]) setSelectedId(created[0].id);
      void refresh();
    },
    [refresh]
  );

  const onStatusChange = useCallback(
    async (id: number, status: Status) => {
      const previous = complaints;
      setComplaints((rows) =>
        rows.map((r) => (r.id === id ? { ...r, status } : r))
      );
      setSaving(true);
      try {
        const res = await fetch(`/api/complaints/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Update failed");
        }
        await refresh();
      } catch (e) {
        setComplaints(previous);
        setDbError(e instanceof Error ? e.message : "Update failed");
      } finally {
        setSaving(false);
      }
    },
    [complaints, refresh]
  );

  const categories = useMemo(
    () => [...new Set(complaints.map((c) => c.category))].sort(),
    [complaints]
  );
  const departments = useMemo(
    () => [...new Set(complaints.map((c) => c.routeTo))].sort(),
    [complaints]
  );

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const rows = complaints.filter((c) => {
      if (filters.priority !== "all" && c.priority !== filters.priority) return false;
      if (filters.category !== "all" && c.category !== filters.category) return false;
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.department !== "all" && c.routeTo !== filters.department) return false;
      if (
        q &&
        !c.summary.toLowerCase().includes(q) &&
        !c.rawText.toLowerCase().includes(q) &&
        !c.locationText?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    if (filters.sort === "priority") {
      rows.sort(
        (a, b) =>
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (filters.sort === "confidence") {
      rows.sort((a, b) => b.confidence - a.confidence);
    } else {
      rows.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return rows;
  }, [complaints, filters]);

  const located = useMemo(
    () => filtered.filter((c) => c.lat != null && c.lng != null),
    [filtered]
  );
  const unlocated = useMemo(
    () => filtered.filter((c) => c.lat == null || c.lng == null),
    [filtered]
  );
  const selected = complaints.find((c) => c.id === selectedId) ?? complaints[0] ?? null;

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative overflow-hidden bg-civic-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 0%, rgba(42,128,169,0.55), transparent 45%), radial-gradient(circle at 85% 10%, rgba(245,158,11,0.35), transparent 40%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 42px 42px, 42px 42px"
          }}
        />
        <div className="relative mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-civic-950 shadow-lg">
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
                and route complaints from raw text onto a living 3D map. No
                external AI APIs, no quota ceilings.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* City pulse: a live indicator that the city is producing data */}
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
            {PIPELINE.map((p) => (
              <span
                key={p.step}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
                title={`Fallback layer ${p.step}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: p.color }}
                />
                {p.step} · {p.label}
              </span>
            ))}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
              title="Civic Incident Neural Network — risk prediction layer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              NN · risk engine
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
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-5 py-6">
        {dbError && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span className="font-bold">Database:</span>
            <span>{dbError}</span>
            <span className="text-rose-500">
              — set DATABASE_URL in Settings → Environment, then refresh.
            </span>
          </div>
        )}

        <StatsStrip stats={stats} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Left column: ingest + live feed + detail */}
          <div className="space-y-5 xl:col-span-4">
            <IngestPanel onTriaged={onTriaged} />
            <LiveFeed onTriaged={onTriaged} />
            <DetailPanel complaint={selected} onStatusChange={onStatusChange} saving={saving} />
          </div>

          {/* Right column: map + twin + queue + analytics */}
          <div className="space-y-5 xl:col-span-8">
            <section className="card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-ink-900">
                    Live complaint map
                  </h2>
                  <p className="text-xs text-ink-500">
                    OpenStreetMap · free geocoding via Nominatim ·{" "}
                    {located.length} of {filtered.length} filtered complaints
                    located · switch below to the 3D twin for spatial context
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  {(["urgent", "high", "medium", "low"] as const).map((p) => (
                    <span key={p} className="inline-flex items-center gap-1.5 text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                        style={{
                          background:
                            p === "urgent"
                              ? "#e11d48"
                              : p === "high"
                                ? "#f97316"
                                : p === "medium"
                                  ? "#f59e0b"
                                  : "#0ea5e9"
                        }}
                      />
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {located.length > 0 ? (
                <MapWrapper
                  complaints={located}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              ) : (
                <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-slate-100 px-6 text-center text-sm text-slate-500">
                  No geocoded complaints in the current filter. Ingest one with a
                  landmark or address — Nominatim will place it here.
                </div>
              )}

              {unlocated.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="label">
                    Not on map (no coordinates): {unlocated.length}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {unlocated.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-civic-300 hover:text-civic-800"
                      >
                        #{c.id} {c.category}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ============ CIVIC DIGITAL TWIN ============ */}
            <section className="card overflow-hidden bg-civic-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Civic digital twin
                  </h2>
                  <p className="text-xs text-civic-200">
                    Incidents as spatial objects — craters, flood volumes, waste
                    heaps; blocks rise with complaint density · drag to orbit,
                    scroll to zoom
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                    ⬤ pothole crater
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                    ▣ flood volume
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                    ▲ waste heap
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                    ◎ pulse = emerging
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">
                    ◯ ring = critical
                  </span>
                </div>
              </div>

              <div className="px-4 pt-4">
                <TwinWrapper
                  items={filtered.slice(0, 24)}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              </div>

              {/* Risk situations strip */}
              <div className="px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="label text-civic-200">
                    Neural risk engine — situations
                    {riskLoading && <span className="ml-2 animate-pulseSoft">scoring…</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshRisk()}
                    className="text-[11px] font-semibold text-civic-300 hover:text-white"
                  >
                    ↻ rescore
                  </button>
                </div>
                {situations.length === 0 && !riskLoading ? (
                  <p className="text-xs text-civic-300">
                    No open complaint clusters to score yet — ingest complaints or
                    start the live feed.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {situations.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedId(s.anchorId)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                          selectedId === s.anchorId
                            ? "border-amber-400/60 bg-white/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              RISK_CHIP[s.level] ?? RISK_CHIP.LOW
                            }`}
                          >
                            NN: {s.level}
                          </span>
                          {s.baselineLevel !== s.level && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-civic-200">
                              rules say {s.baselineLevel}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-white">
                            {s.category} ×{s.complaintCount}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-civic-100">
                          {s.location ?? "unlocated"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-civic-300">
                          {s.explanation}
                          {s.rainfallMm != null && s.rainfallMm > 0
                            ? ` · rain ${s.rainfallMm}mm/24h`
                            : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ============ NEURAL NETWORK DIAGRAM ============ */}
            <NeuralNetDiagram
              prediction={selectedPrediction}
              situationLabel={
                selected ? `#${selected.id} · ${selected.category}` : "no selection"
              }
            />

            {/* Filters */}
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
                        sort: e.target.value as Filters["sort"]
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
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, query: e.target.value }))
                    }
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

            <QueueList
              items={filtered}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />

            <ChannelsPanel onTriaged={onTriaged} />
            <AnalyticsPanel complaints={complaints} />
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-[1440px] px-5 pb-10 pt-2 text-center text-xs text-slate-400">
        CivicLens · three-layer fallback triage (ML model → lexical rules →
        manual review) · Civic Incident NN risk engine · 3D digital twin ·
        WhatsApp / X / News channels · Leaflet + OpenStreetMap + Nominatim ·
        Postgres via Neon · hackathon demo, no login required.
      </footer>
    </div>
  );
}
