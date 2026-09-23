/** L2 fallback: deterministic lexical scoring — no network, no model file.
 *
 * When the ML service (L1) is unreachable, this in-process scorer classifies
 * with weighted keyword votes. Cruder than the SVM, but robust and fast.
 */
import { CATEGORY_DEPARTMENT, type Priority } from "../civic";

type LexRule = { category: string; urgency: Priority; keywords: string[] };

const CATEGORY_KEYWORDS: LexRule[] = [
  {
    category: "Pothole",
    urgency: "high",
    keywords: [
      "pothole", "potholes", "gaddha", "road cavity", "road damage",
      "crater", "sinkhole", "broken road", "road surface", "tar road",
    ],
  },
  {
    category: "Drainage",
    urgency: "high",
    keywords: [
      "drainage", "drain", "nali", "waterlog", "water logged", "standing water",
      "flooded", "clogged", "choked", "desilt", "silt", "stagnant water",
    ],
  },
  {
    category: "Waste",
    urgency: "high",
    keywords: [
      "garbage", "trash", "waste", "kachra", "litter", "dumping", "debris",
      "bin", "bins", "uncollected waste", "garbage truck", "segregation",
    ],
  },
  {
    category: "Water",
    urgency: "high",
    keywords: [
      "water leak", "leaking", "pipe burst", "pipeline", "water supply",
      "no water", "contaminated", "tap water", "supply line", "valve",
      "tanker", "leak", "paani",
    ],
  },
  {
    category: "Streetlight",
    urgency: "medium",
    keywords: [
      "streetlight", "street light", "street lamp", "lamp post", "light pole",
      "bijli", "unlit", "pole lights", "flicker", "led fittings", "dark street",
      "dark at night", "not working light",
    ],
  },
  {
    category: "Sewage",
    urgency: "urgent",
    keywords: [
      "sewage", "sewer", "manhole", "sewage overflow", "sewage flooding",
      "toilet lines", "jetting", "inspection chamber", "ganda paani",
      "sewage water", "wastewater", "waste water", "drain water",
      "sewer line", "raw sewage", "backing up",
    ],
  },
  {
    category: "Graffiti",
    urgency: "low",
    keywords: [
      "graffiti", "poster", "posters", "defaced", "vandalism", "banners",
      "flex boards", "spray-painted", "metro pillar", "wall covered",
    ],
  },
  {
    category: "Other",
    urgency: "medium",
    keywords: [
      "stray dogs", "stray cattle", "loudspeakers", "encroachment",
      "abandoned vehicle", "tree branch", "illegal parking", "footpath",
      "noise", "cattle", "dogs",
    ],
  },
];

const URGENT_MARKERS = [
  "urgent", "emergency", "accident", "fell", "children", "school",
  "hospital", "unsafe", "health hazard", "immediately", "today",
  "life risk", "collapse", "gir gaye", "live wire", "electrocut",
];

const HIGH_MARKERS = [
  "dangerous", "huge", "massive", "deep", "crater", "choked", "blocked",
  "waterlogged", "overflowing", "unbearable", "gushing", "burst",
  "dead for", "no water", "weeks", "days", "contaminated",
];

const LOW_MARKERS = ["minor", "small", "cosmetic", "suggestion", "whenever", "no rush"];

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

/**
 * Classify raw complaint text with keyword votes.
 * `matchInfo` (optional) receives how many keyword hits fired — used for the
 * confidence heuristic and pipeline notes.
 */
export function classifyLexical(
  rawText: string,
  matchInfo?: { hits: number }
): {
  category: string;
  priority: Priority;
  routeTo: string;
  summary: string;
  confidence: number;
  locationText: string;
} {
  const text = rawText.toLowerCase();

  let best: { rule: LexRule; hits: number; weight: number } | null = null;
  for (const rule of CATEGORY_KEYWORDS) {
    let hits = 0;
    let weight = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        hits += 1;
        weight += kw.includes(" ") ? 2 : 1;
      }
    }
    if (hits > 0 && (!best || weight > best.weight)) {
      best = { rule, hits, weight };
    }
  }

  if (!best) {
    return {
      category: "Other",
      priority: "medium",
      routeTo: CATEGORY_DEPARTMENT.Other,
      summary: "Unclassified complaint — routed to manual review.",
      confidence: 0.2,
      locationText: "",
    };
  }

  let level: number = PRIORITIES.indexOf(best.rule.urgency);
  if (URGENT_MARKERS.some((m) => text.includes(m))) level = 3;
  else if (LOW_MARKERS.some((m) => text.includes(m))) level = 0;
  else if (HIGH_MARKERS.some((m) => text.includes(m))) level = Math.max(level, 2);

  const firstSentence =
    rawText.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? rawText.trim();
  const summary =
    firstSentence.length > 160
      ? `${firstSentence.slice(0, 157)}…`
      : firstSentence || `Complaint classified as ${best.rule.category}.`;

  if (matchInfo) matchInfo.hits = best.hits;

  return {
    category: best.rule.category,
    priority: PRIORITIES[level],
    routeTo: CATEGORY_DEPARTMENT[best.rule.category] ?? "General Grievance Cell",
    summary,
    confidence: Math.min(0.8, 0.45 + best.weight * 0.07),
    locationText: "",
  };
}
