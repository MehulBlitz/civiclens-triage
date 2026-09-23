/**
 * CivicLens triage pipeline — three resilient layers, never throws:
 *
 *  L1  ml_model  Python scikit-learn service (FastAPI): TF-IDF word+char
 *                n-grams -> calibrated Linear SVM heads for category and
 *                priority. Local, fast, no external API, no quota.
 *  L2  rules     In-process lexical engine (weighted keyword voting +
 *                severity markers, Hinglish-aware). Runs even if the ML
 *                service is down.
 *  L3  manual    No layer matched — complaint lands in the needs_review
 *                queue for a human decision. The pipeline never fails.
 *
 * After classification, unresolved locations are geocoded with free
 * Nominatim (OpenStreetMap) so every complaint can appear on the map.
 */
import { geocode } from "./geocode";
import { classifyLexical } from "./lexical";
import { mlClassifyBatch } from "./ml";
import { CATEGORIES, CATEGORY_DEPARTMENT, PRIORITIES, type Priority } from "../civic";

export type SourceLayer = "ml_model" | "rules" | "manual";

export type TriageOutcome = {
  category: string;
  priority: string;
  routeTo: string;
  summary: string;
  confidence: number;
  locationText: string;
  lat: number | null;
  lng: number | null;
  sourceLayer: SourceLayer;
  status: "open" | "needs_review";
  /** Human-readable pipeline trace (which layers ran, why they fell back). */
  notes: string[];
};

const MANUAL_RESULT = {
  category: "Other",
  priority: "medium" as Priority,
  routeTo: CATEGORY_DEPARTMENT.Other,
  summary:
    "Unclassified civic complaint — routed to manual review for a human decision.",
  confidence: 0.2,
};

/** Validating normalizer shared by both layers (defence in depth). */
function normalize(
  raw: {
    category: string;
    priority: string;
    routeTo: string;
    summary: string;
    confidence: number;
    locationText: string;
  },
  sourceLayer: SourceLayer,
  fallbackSummary: string
): TriageOutcome {
  const category = (CATEGORIES as readonly string[]).includes(raw.category)
    ? raw.category
    : "Other";
  const priority = (PRIORITIES as readonly string[]).includes(raw.priority)
    ? raw.priority
    : "medium";
  const departments = Object.values(CATEGORY_DEPARTMENT);
  const routeTo =
    raw.routeTo && departments.includes(raw.routeTo)
      ? raw.routeTo
      : CATEGORY_DEPARTMENT[category];
  const confidence = Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;
  return {
    category,
    priority,
    routeTo,
    summary: raw.summary?.trim() || fallbackSummary,
    confidence,
    locationText: raw.locationText?.trim() ?? "",
    lat: null,
    lng: null,
    sourceLayer,
    status: "open",
    notes: [],
  };
}

/**
 * Triage one complaint through the layered pipeline.
 * Text-only by design: the ML model handles English + Hinglish phrasing,
 * and images remain attached to the record as evidence for human review.
 */
export async function triageComplaint(
  rawText: string,
  opts: { imageUrl?: string | null; locationHint?: string | null } = {}
): Promise<TriageOutcome> {
  const notes: string[] = [];
  let outcome: TriageOutcome | null = null;

  // --- L1: Python ML model service ---------------------------------------
  try {
    const ml = await mlClassifyBatch([rawText]);
    if (ml.ok) {
      const p = ml.results[0];
      outcome = normalize(
        {
          category: p.category,
          priority: p.priority,
          routeTo: CATEGORY_DEPARTMENT[p.category] ?? CATEGORY_DEPARTMENT.Other,
          summary: firstSentence(rawText),
          confidence: p.confidence,
          locationText: "",
        },
        "ml_model",
        "Citizen complaint classified by the CivicLens ML model."
      );
      notes.push(
        `L1 ML model: ${p.category}/${p.priority} (confidence ${Math.round(
          p.confidence * 100
        )}%)`
      );

      // --- L2 arbitration: when the model is unsure but the lexical engine
      // finds strong keyword evidence pointing elsewhere, the rule engine
      // overrules. Transparent: the trace records the disagreement.
      const matchInfo = { hits: 0 };
      const lex = classifyLexical(rawText, matchInfo);
      const strongLexical = matchInfo.hits >= 2 && lex.category !== "Other";
      const unsureModel = p.confidence < 0.7;
      if (strongLexical && unsureModel && lex.category !== p.category) {
        outcome = normalize(
          lex,
          "rules",
          "Citizen complaint classified by lexical rules."
        );
        notes.push(
          `L2 arbitration: L1 unsure (${p.category} @ ${Math.round(
            p.confidence * 100
          )}%) vs keyword evidence (${matchInfo.hits} hits → ${lex.category}) — L2 decided`
        );
      }
    } else {
      notes.push(`L1 ML model unavailable: ${ml.error}`);
    }
  } catch (e) {
    notes.push(
      `L1 ML model threw: ${e instanceof Error ? e.message : "unknown"}`
    );
  }

  // --- L2: lexical rule engine --------------------------------------------
  if (!outcome) {
    notes.push("L2 lexical rules: classifying in-process");
    const matchInfo = { hits: 0 };
    const r = classifyLexical(rawText, matchInfo);
    if (matchInfo.hits > 0) {
      outcome = normalize(r, "rules", "Citizen complaint classified by lexical rules.");
      notes.push(
        `L2 rules: ${r.category}/${r.priority} (${matchInfo.hits} keyword hits)`
      );
    } else {
      notes.push("L2 rules: no keyword match — escalating to manual review");
    }
  }

  // --- L3: manual review ----------------------------------------------------
  if (!outcome) {
    outcome = normalize(
      { ...MANUAL_RESULT, locationText: "" },
      "manual",
      MANUAL_RESULT.summary
    );
    outcome.status = "needs_review";
    notes.push("L3 manual review: queued for a human decision");
  }

  // --- Location: user hint first, then free Nominatim geocoding ------------
  const hint = opts.locationHint?.trim();
  if (!outcome.locationText && hint) outcome.locationText = hint;

  if (outcome.locationText && outcome.lat == null) {
    const point = await geocode(outcome.locationText);
    if (point) {
      outcome.lat = point.lat;
      outcome.lng = point.lng;
      notes.push(`Nominatim geocoded "${outcome.locationText}"`);
    } else {
      notes.push(`Nominatim: no coordinates for "${outcome.locationText}"`);
    }
  }

  // Attach the full pipeline trace for the API response / UI transparency.
  outcome.notes = notes;
  return outcome;
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? text.trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s || "Civic complaint ingested.";
}

export { CATEGORIES };
