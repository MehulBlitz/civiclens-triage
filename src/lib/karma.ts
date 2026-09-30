/**
 * Civic Karma — the citizen-incentive engine.
 *
 * Every meaningful civic action earns points, stored in an inspectable
 * ledger (`karma_ledger`). Points drive tiers (Rookie → Civic Legend) which
 * the UI shows as badges; a live leaderboard ranks the most active citizens.
 *
 * Never throws: award failures are logged, not raised — karma is a bonus
 * layer on top of the triage pipeline, never a blocker.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { karmaLedger } from "./schema";
import { KARMA_POINTS, KARMA_TIERS } from "./civic";

export type KarmaAction = keyof typeof KARMA_POINTS;

export type CitizenScore = {
  citizen: string;
  points: number;
  tier: { name: string; color: string; next: string | null; toNext: number };
};

/** Award points for an action. Failure is logged, never raised. */
export async function awardKarma(
  citizen: string,
  action: KarmaAction,
  complaintId?: number
): Promise<number> {
  const points = KARMA_POINTS[action];
  try {
    const { db } = getDb();
    await db.insert(karmaLedger).values({
      citizen,
      action,
      points,
      complaintId: complaintId ?? null
    });
    return points;
  } catch (e) {
    console.error(
      "[karma] award failed (non-fatal):",
      e instanceof Error ? e.message : e
    );
    return 0;
  }
}

/** Tier lookup for a point total. */
export function tierFor(points: number) {
  let tier = KARMA_TIERS[0];
  for (const t of KARMA_TIERS) if (points >= t.min) tier = t;
  const next = KARMA_TIERS.find((t) => t.min > points) ?? null;
  return {
    name: tier.name,
    color: tier.color,
    next: next?.name ?? null,
    toNext: next ? next.min - points : 0
  };
}

/** Aggregate ledger → per-citizen scores, ranked. */
export async function leaderboard(limit = 10): Promise<CitizenScore[]> {
  try {
    const { db } = getDb();
    const rows = await db
      .select({
        citizen: karmaLedger.citizen,
        points: sql<number>`sum(${karmaLedger.points})::int`
      })
      .from(karmaLedger)
      .groupBy(karmaLedger.citizen)
      .orderBy(desc(sql`sum(${karmaLedger.points})`))
      .limit(limit);
    return rows.map((r) => ({
      citizen: r.citizen,
      points: r.points,
      tier: tierFor(r.points)
    }));
  } catch {
    return [];
  }
}

/** Recent ledger entries (audit trail). */
export async function recentLedger(limit = 20) {
  try {
    const { db } = getDb();
    return await db
      .select()
      .from(karmaLedger)
      .orderBy(desc(karmaLedger.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}

/** Total points for one citizen. */
export async function citizenPoints(citizen: string): Promise<number> {
  try {
    const { db } = getDb();
    const [row] = await db
      .select({ points: sql<number>`coalesce(sum(${karmaLedger.points}), 0)::int` })
      .from(karmaLedger)
      .where(eq(karmaLedger.citizen, citizen));
    return row?.points ?? 0;
  } catch {
    return 0;
  }
}
