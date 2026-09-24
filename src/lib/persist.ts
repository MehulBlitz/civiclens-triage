/**
 * Persistence layer for triage outcomes — with crowd clustering.
 *
 * When a new complaint is textually/geographically near a recent OPEN
 * complaint, it is merged into the existing master row (reportCount++) instead
 * of creating a duplicate row. Crossing ESCALATE_AT auto-escalates priority
 * and re-routes — "20 citizens reporting the same pothole beats one".
 */
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { getDb } from "./db";
import { complaints, type NewComplaint } from "./schema";
import { PRIORITIES, PRIORITY_RANK } from "./civic";

/** Merge complaints reported within this many hours into one cluster. */
const CLUSTER_WINDOW_HOURS = 48;
/** Auto-escalate a cluster once this many citizens have reported it. */
export const ESCALATE_AT = 3;
/** Similarity required to call two complaints the same issue. */
const SIMILARITY_THRESHOLD = 0.45;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "has",
  "was", "were", "are", "not", "but", "our", "you", "your", "please",
  "there", "here", "near", "very", "its", "it's", "been", "still",
  "dear", "regards", "hello", "team", "sir", "madam", "kindly"
]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/** Jaccard similarity over content words. */
function similarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function escalate(priority: string): string {
  const rank = PRIORITY_RANK[priority] ?? 2;
  return PRIORITIES[Math.min(PRIORITIES.length - 1, rank)] ?? "urgent";
}

export type PersistResult =
  | {
      merged: false;
      row: typeof complaints.$inferSelect;
    }
  | {
      merged: true;
      row: typeof complaints.$inferSelect;
      /** How many citizens had reported this same issue before. */
      reportCount: number;
      /** Whether this merge triggered an escalation. */
      escalated: boolean;
      /** Priority after escalation (may differ from the fresh ML output). */
      priority: string;
    };

/**
 * Insert a fresh triaged complaint, or merge it into a recent open complaint
 * when they describe the same issue near the same location.
 */
export async function persistComplaint(
  incoming: NewComplaint & { notes?: string[] }
): Promise<PersistResult> {
  const { db } = getDb();

  // Cluster candidates: OPEN complaints from the last CLUSTER_WINDOW_HOURS.
  const windowStart = new Date(Date.now() - CLUSTER_WINDOW_HOURS * 3_600_000);
  const candidates = await db
    .select()
    .from(complaints)
    .where(
      and(
        gte(complaints.createdAt, windowStart),
        ne(complaints.status, "resolved")
      )
    )
    .orderBy(desc(complaints.createdAt))
    .limit(50);

  const best = { row: null as typeof complaints.$inferSelect | null, sim: 0 };
  for (const cand of candidates) {
    if (cand.category !== incoming.category) continue;
    // Location proximity matters: same area (or both unlocated) + similar text.
    const locScore =
      cand.lat != null && incoming.lat != null
        ? 1 - Math.min(1, Math.hypot(cand.lat - incoming.lat, (incoming.lng ?? 0) - (cand.lng ?? 0)) * 30)
        : 0.5;
    if (locScore < 0.4) continue;
    const sim = similarity(incoming.rawText, cand.rawText);
    const score = 0.65 * sim + 0.35 * locScore;
    if (score > best.sim) {
      best.row = cand;
      best.sim = score;
    }
  }

  // Merge when the combined similarity clears the threshold.
  if (best.row && best.sim >= SIMILARITY_THRESHOLD) {
    const master = best.row;
    const reportCount = master.reportCount + 1;
    const newPriority = escalate(master.priority);
    const escalated =
      reportCount >= ESCALATE_AT && master.priority !== newPriority;
    const duplicateTexts = [
      ...(master.duplicateTexts ?? "").split("\n").filter(Boolean),
      incoming.rawText.slice(0, 120)
    ]
      .slice(-6)
    .join("\n");

    // Merged evidence refreshes the trust picture: the newest analysis wins
    // (it sees the latest photo + corpus phashes) and the crowd component of
    // every future trust computation grows with reportCount.
    const trustUpdate = incoming.trustScore != null
      ? {
          trustScore: incoming.trustScore,
          trustBand: incoming.trustBand,
          trustBreakdown: incoming.trustBreakdown,
          trustFlags: incoming.trustFlags,
          imagePhash: incoming.imagePhash ?? master.imagePhash,
          cnnCategory: incoming.cnnCategory ?? master.cnnCategory,
          cnnSeverity: incoming.cnnSeverity ?? master.cnnSeverity,
          visionSource: incoming.visionSource ?? master.visionSource,
        }
      : {};

    const [updated] = await db
      .update(complaints)
      .set({
        reportCount,
        priority: escalated ? newPriority : master.priority,
        escalatedAt: reportCount >= ESCALATE_AT ? (master.escalatedAt ?? new Date()) : master.escalatedAt,
        duplicateTexts,
        ...trustUpdate
      })
      .where(eq(complaints.id, master.id))
      .returning();
    return {
      merged: true,
      row: updated,
      reportCount,
      escalated,
      priority: updated?.priority ?? master.priority
    };
  }

  // Fresh ticket.
  const { notes: _notes, ...values } = incoming;
  const [row] = await db.insert(complaints).values(values).returning();
  return { merged: false, row };
}
