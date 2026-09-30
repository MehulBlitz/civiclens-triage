/**
 * Live-model bridge for the static GitHub Pages site.
 *
 * The site normally classifies entirely client-side (distilled BMC lexicon →
 * hand rules → manual). When a live CivicLens ML service is available, it
 * upgrades the classification to the real L1 SVM + CNN: set
 * `VITE_ML_SERVICE_URL` at build time (e.g. your Railway/Render model URL).
 *
 * Design contract: the bridge NEVER blocks the form. Every path resolves to a
 * result; on any failure it returns null and the caller keeps the local
 * classification. Layer provenance is preserved end-to-end.
 */
import { classify, type TriageResult } from "./triage";

const BASE = (import.meta.env?.VITE_ML_SERVICE_URL ?? "").replace(/\/$/, "");
export const ML_LIVE = BASE.length > 0;

export type LiveModelResult = {
  category: string;
  priority: TriageResult["priority"];
  confidence: number;
  sourceLayer: "live_ml" | TriageResult["sourceLayer"];
  modelUrl: string | null;
  severity?: number;
};

type PredictRow = {
  category: string;
  priority: string;
  category_confidence?: number;
  priority_confidence?: number;
};

/** Classify via the live service; null → caller falls back to local pipeline. */
export async function classifyLive(text: string): Promise<LiveModelResult | null> {
  const local: TriageResult = classify(text);
  if (!ML_LIVE || !text.trim()) {
    return { ...local, modelUrl: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [text] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ml_${res.status}`);
    const data = (await res.json()) as { results?: PredictRow[] };
    const row = data.results?.[0];
    if (!row?.category) throw new Error("ml_empty");
    const priority = (["urgent", "high", "medium", "low"] as const).includes(
      row.priority as never
    )
      ? (row.priority as LiveModelResult["priority"])
      : local.priority;
    return {
      category: row.category,
      priority,
      confidence: Math.max(row.category_confidence ?? 0.5, 0.5),
      sourceLayer: "live_ml",
      modelUrl: BASE,
    };
  } catch {
    return { ...local, modelUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Optional photo uplift: severity from the CNN on the live service. */
export async function analyzePhotoLive(file: File): Promise<number | null> {
  if (!ML_LIVE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const res = await fetch(`${BASE}/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: btoa(bin) }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; severity?: number };
    return data.ok ? (data.severity ?? null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
