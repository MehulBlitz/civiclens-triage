import { NextResponse } from "next/server";
import { bootstrapDb, DbUnavailableError } from "@/lib/db";
import { leaderboard, recentLedger, citizenPoints, tierFor } from "@/lib/karma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/karma — Civic Karma board: leaderboard, recent ledger, and
 * per-citizen totals (`?citizen=`). Degrades to empty lists, never throws.
 */
export async function GET(req: Request) {
  const citizen = new URL(req.url).searchParams.get("citizen");
  try {
    await bootstrapDb();
  } catch {
    return NextResponse.json({ leaderboard: [], ledger: [], dbError: "database unavailable" });
  }

  const board = await leaderboard(12);
  const ledger = await recentLedger(24);
  const me = citizen ? await citizenPoints(citizen) : null;

  return NextResponse.json({
    leaderboard: board,
    ledger,
    me: citizen && me !== null ? { citizen, points: me, tier: tierFor(me) } : null
  });
}
