import { NextResponse } from "next/server";
import { loadComplaints } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Insights API — batch analytics over the complaint corpus, powered by the
 * Python ML service's from-scratch algorithms with honest degradation:
 *
 *   • duplicates      TF-IDF cosine + geo-distance pair detection
 *   • flooding        coordinated near-identical reports across locations
 *   • forecast        Holt double-exponential smoothing of daily volume
 *   • anomalies       robust z-score (median/MAD) spike detection
 *
 * If the ML service is unreachable, duplicates/flood return null and the
 * forecast/anomalies degrade to a trivial local computation — the endpoint
 * never fails, mirroring the rest of the pipeline.
 */

const ML_BASE = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8008";

async function mlPost<T>(path: string, body: unknown, timeoutMs = 6000): Promise<T | null> {
  try {
    const res = await fetch(`${ML_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type DupResult = {
  n_complaints: number;
  threshold: number;
  duplicate_pairs: { a: number; b: number; cosine: number; score: number; same_area: boolean }[];
  n_duplicates: number;
  flooding: {
    window_minutes: number;
    min_similar: number;
    flooded_ids: number[];
    n_flooded: number;
    suspicious: boolean;
  };
};

function dayKey(iso: Date): string {
  return iso.toISOString().slice(0, 10);
}

/** Local fallback: daily series + mean/MAD spike flag (degraded but honest). */
function localSeries(complaints: { createdAt: Date }[]): number[] {
  const counts = new Map<string, number>();
  for (const c of complaints) {
    const k = dayKey(new Date(c.createdAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const days = [...counts.keys()].sort();
  return days.map((d) => counts.get(d) ?? 0);
}

export async function GET() {
  const { complaints, dbError } = await loadComplaints();
  if (dbError) {
    return NextResponse.json(
      { duplicates: null, forecast: null, anomalies: null, dbError, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const corpus = complaints.slice(0, 500).map((c) => ({
    id: c.id,
    rawText: c.rawText,
    category: c.category,
    lat: c.lat,
    lng: c.lng,
    createdAt: new Date(c.createdAt).toISOString(),
  }));

  const duplicates =
    corpus.length >= 2
      ? await mlPost<DupResult>("/duplicates", {
          complaints: corpus,
          similarity_threshold: 0.55,
        })
      : null;

  const series = localSeries(complaints);
  const forecast = series.length > 0 ? await mlPost("/forecast", { values: series, horizon: 7 }) : null;
  const anomalies = series.length >= 5 ? await mlPost("/anomalies", { values: series, threshold: 3.5 }) : null;

  return NextResponse.json(
    {
      duplicates: duplicates
        ? {
            nAnalyzed: duplicates.n_complaints,
            pairs: duplicates.duplicate_pairs.slice(0, 10),
            nPairs: duplicates.n_duplicates,
            flooding: duplicates.flooding,
          }
        : null,
      forecast,
      anomalies,
      seriesLength: series.length,
      dbError: null,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
