import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";
import { awardKarma } from "@/lib/karma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cosign — community petition pressure ("+1 support").
 * Cosigning bumps the ticket's social weight; at 5 signatures the complaint
 * is auto-escalated one priority level (crowd power, same as duplicates).
 * The co-signer earns Civic Karma.
 */
export async function POST(req: Request) {
  let body: { complaintId?: unknown; citizen?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const complaintId = Number(body.complaintId);
  if (!Number.isInteger(complaintId)) {
    return NextResponse.json({ error: "complaintId must be an integer" }, { status: 400 });
  }
  const citizen =
    typeof body.citizen === "string" && body.citizen.trim()
      ? body.citizen.trim().slice(0, 60)
      : "Anonymous Citizen";

  try {
    await bootstrapDb();
    const { db } = getDb();

    const [complaint] = await db
      .select()
      .from(complaints)
      .where(eq(complaints.id, complaintId));
    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const cosignCount = complaint.cosignCount + 1;

    // 5 co-signatures → escalate one priority level (crowd pressure).
    const RANK: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
    const NAMES = ["low", "medium", "high", "urgent"];
    let priority = complaint.priority;
    let escalated = false;
    if (cosignCount >= 5 && complaint.status === "open") {
      const nextRank = Math.min(4, (RANK[complaint.priority] ?? 2) + 1);
      if (nextRank > (RANK[complaint.priority] ?? 2)) {
        priority = NAMES[nextRank - 1];
        escalated = true;
      }
    }

    const [updated] = await db
      .update(complaints)
      .set({ cosignCount, priority })
      .where(eq(complaints.id, complaintId))
      .returning();

    const karma = await awardKarma(citizen, "cosign", complaint.id);

    return NextResponse.json({
      complaint: updated,
      karmaAwarded: karma,
      escalated
    });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

/** GET /api/cosign?complaintId=N — current count. */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("complaintId"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "complaintId required" }, { status: 400 });
  }
  try {
    await bootstrapDb();
    const { db } = getDb();
    const [row] = await db
      .select({ cosignCount: complaints.cosignCount })
      .from(complaints)
      .where(eq(complaints.id, id));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "DB error" },
      { status: 503 }
    );
  }
}
