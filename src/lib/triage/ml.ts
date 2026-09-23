/**
 * Client for the CivicLens Python ML inference service (FastAPI + scikit-learn).
 *
 * L1 of the triage pipeline: TF-IDF (word 1-2 grams + char 3-5 grams) +
 * engineering features -> calibrated Linear SVM heads for category and
 * priority. Trained in ml/train.py, served by ml/serve.py.
 *
 * If the service is unreachable, times out or replies non-JSON, callers fall
 * back to L2 (lexical scoring, below) — the pipeline never throws.
 */

export type MlPrediction = {
  category: string;
  category_confidence: number;
  priority: string;
  priority_confidence: number;
  confidence: number;
};

const BASE_URL =
  process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_ML_SERVICE_URL ?? "http://127.0.0.1:8008";
const TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS ?? 4000);

/** Severity lexicon shared by the ML feature extractor and the L2 fallback. */
export const URGENT_MARKERS = [
  "urgent", "emergency", "accident", "fell", "children", "school",
  "hospital", "unsafe", "health hazard", "immediately", "today",
  "life risk", "collapse", "gir gaye", "live wire", "electrocut",
] as const;

export const HIGH_MARKERS = [
  "dangerous", "huge", "massive", "deep", "crater", "choked", "blocked",
  "waterlogged", "overflowing", "unbearable", "gushing", "burst",
  "dead for", "no water", "weeks", "days", "contaminated",
] as const;

export const LOW_MARKERS = [
  "minor", "small", "cosmetic", "suggestion", "whenever", "no rush",
] as const;

export type MlBatchResult =
  | { ok: true; results: MlPrediction[] }
  | { ok: false; error: string };

/** POST /predict — returns null-ish result on any failure (caller falls back). */
export async function mlClassifyBatch(texts: string[]): Promise<MlBatchResult> {
  try {
    const res = await fetch(`${BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: texts.slice(0, 20) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Next.js must not cache POSTs; keep the runtime honest.
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `ML service ${res.status} ${body.slice(0, 120)}` };
    }
    const data = (await res.json()) as { results?: MlPrediction[] };
    if (!Array.isArray(data.results) || data.results.length === 0) {
      return { ok: false, error: "ML service returned no results" };
    }
    return { ok: true, results: data.results };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ML service unreachable",
    };
  }
}

export type ExplainResult = {
  category: string;
  priority: string;
  category_probabilities: Record<string, number>;
  priority_probabilities: Record<string, number>;
  category_evidence: { supports: Evidence[]; against: Evidence[] };
  priority_evidence: { supports: Evidence[]; against: Evidence[] };
};

export type Evidence = {
  feature: string;
  kind: string;
  contribution: number;
};

/** POST /explain — why did the model decide this? (falls back to null) */
export async function mlExplain(text: string): Promise<ExplainResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store"
    });
    if (!res.ok) return null;
    return (await res.json()) as ExplainResult;
  } catch {
    return null;
  }
}

/** GET /health — used by /api/health diagnostics. */
export async function mlHealth(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
