"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Complaint } from "@/lib/schema";
import type { LoadResult, Stats } from "@/lib/queries";
import type { Status } from "@/lib/civic";
import { PRIORITY_RANK } from "@/lib/civic";
import { predictRisk, type RiskPrediction } from "@/lib/nn/infer";
import {
  trafficLevelForHour,
  timeOfDayEncoding,
  type RiskFeatureInput,
} from "@/lib/nn/features";

export type Filters = {
  priority: string;
  category: string;
  status: string;
  department: string;
  query: string;
  sort: "newest" | "priority" | "confidence";
};

export const DEFAULT_FILTERS: Filters = {
  priority: "all",
  category: "all",
  status: "all",
  department: "all",
  query: "",
  sort: "newest",
};

export type Situation = {
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
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
};

export { RISK_CHIP };

export type CivicContextValue = ReturnType<typeof useCivicState>;

function useCivicState(initial: LoadResult) {
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
  const [selectedPrediction, setSelectedPrediction] =
    useState<RiskPrediction | null>(null);
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
  const selected =
    complaints.find((c) => c.id === selectedId) ?? complaints[0] ?? null;

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  return {
    complaints,
    stats,
    dbError,
    selectedId,
    setSelectedId,
    filters,
    setFilters,
    saving,
    refreshing,
    refresh,
    situations,
    riskLoading,
    refreshRisk,
    selectedPrediction,
    riskSource,
    onTriaged,
    onStatusChange,
    categories,
    departments,
    filtered,
    located,
    unlocated,
    selected,
    resetFilters,
  };
}

const CivicContext = createContext<CivicContextValue | null>(null);

export function CivicProvider({
  initial,
  children,
}: {
  initial: LoadResult;
  children: React.ReactNode;
}) {
  const value = useCivicState(initial);
  return <CivicContext.Provider value={value}>{children}</CivicContext.Provider>;
}

export function useCivic(): CivicContextValue {
  const ctx = useContext(CivicContext);
  if (!ctx) throw new Error("useCivic must be used within CivicProvider");
  return ctx;
}
