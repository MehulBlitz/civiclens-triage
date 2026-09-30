import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/verify — officer (or policy) sign-off on a field resolution.
 * `reject: true` demands rework: the ticket reopens for the assigned crew.
 * Verified tickets count toward the contractor compliance ledger.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  let body: { complaintId?: unknown; reject?: unknown; verifiedBy?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const complaintId = Number(body.complaintId);
  if (!Number.isInteger(complaintId)) {
    return NextResponse.json({ error: "complaintId must be an integer" }, { status: 400 });
  }
  const verifiedBy =
    typeof body.verifiedBy === "string" && body.verifiedBy.trim()
      ? body.verifiedBy.trim()
      : "Ward Officer";

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

    const reject = body.reject === true;
    const [updated] = await db
      .update(complaints)
      .set(
        reject
          ? {
              // Rework: back to the crew, previous proof kept for audit.
              status: "in_progress",
              verified: false,
              verifiedAt: null,
              verifiedBy: null,
              resolvedAt: null
            }
          : {
              status: "resolved",
              verified: true,
              verifiedAt: new Date(),
              verifiedBy
            }
      )
      .where(eq(complaints.id, complaintId))
      .returning();

    return NextResponse.json({
      complaint: updated,
      outcome: reject ? "rework" : "verified"
    });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
