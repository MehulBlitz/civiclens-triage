import { desc } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "./db";
import { complaints, type Complaint } from "./schema";
import { PRIORITY_RANK } from "./civic";

export type Stats = {
  total: number;
  open: number;
  urgent: number;
  needsReview: number;
  located: number;
  avgConfidence: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byDepartment: Record<string, number>;
};

export type LoadResult = {
  complaints: Complaint[];
  stats: Stats;
  dbError: string | null;
};

const emptyStats = (): Stats => ({
  total: 0,
  open: 0,
  urgent: 0,
  needsReview: 0,
  located: 0,
  avgConfidence: 0,
  byPriority: {},
  byStatus: {},
  byCategory: {},
  byDepartment: {}
});

const bump = (acc: Record<string, number>, key: string) => {
  acc[key] = (acc[key] ?? 0) + 1;
};

export function computeStats(rows: Complaint[]): Stats {
  const stats = emptyStats();
  stats.total = rows.length;
  let confidenceSum = 0;
  for (const row of rows) {
    bump(stats.byPriority, row.priority);
    bump(stats.byStatus, row.status);
    bump(stats.byCategory, row.category);
    bump(stats.byDepartment, row.routeTo);
    if (row.status === "open") stats.open += 1;
    if (row.priority === "urgent" && row.status !== "resolved") stats.urgent += 1;
    if (row.status === "needs_review") stats.needsReview += 1;
    if (row.lat != null && row.lng != null) stats.located += 1;
    confidenceSum += row.confidence ?? 0;
  }
  stats.avgConfidence = rows.length
    ? Math.round((confidenceSum / rows.length) * 100) / 100
    : 0;
  return stats;
}

export function prioritySortValue(priority: string): number {
  return PRIORITY_RANK[priority] ?? 0;
}

export async function loadComplaints(): Promise<LoadResult> {
  try {
    await bootstrapDb();
    const { db } = getDb();
    const rows = await db.select().from(complaints).orderBy(desc(complaints.createdAt));
    return { complaints: rows, stats: computeStats(rows), dbError: null };
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : e instanceof Error
          ? `Database error: ${e.message}`
          : "Database unavailable";
    return { complaints: [], stats: emptyStats(), dbError: message };
  }
}
