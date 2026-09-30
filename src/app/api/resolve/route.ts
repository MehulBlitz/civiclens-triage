import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints, workers } from "@/lib/schema";
import { awardKarma } from "@/lib/karma";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/resolve — the field crew submits resolution proof:
 * an after-photo URL + work notes. Moves assigned/in_progress → resolved
 * (pending officer verification). Awards Civic Karma when the reporter
 * supplied photo evidence at intake.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  let body: {
    complaintId?: unknown;
    resolvedPhotoUrl?: unknown;
    resolvedNotes?: unknown;
    workerName?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const complaintId = Number(body.complaintId);
  if (!Number.isInteger(complaintId)) {
    return NextResponse.json({ error: "complaintId must be an integer" }, { status: 400 });
  }
  const resolvedNotes =
    typeof body.resolvedNotes === "string" ? body.resolvedNotes.trim() : "";
  if (!resolvedNotes) {
    return NextResponse.json(
      { error: "Work notes are required — describe what was done" },
      { status: 400 }
    );
  }

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

    const [updated] = await db
      .update(complaints)
      .set({
        status: "resolved",
        resolvedPhotoUrl:
          typeof body.resolvedPhotoUrl === "string" && body.resolvedPhotoUrl
            ? body.resolvedPhotoUrl
            : null,
        resolvedNotes: resolvedNotes.slice(0, 2000),
        resolvedAt: new Date()
      })
      .where(eq(complaints.id, complaintId))
      .returning();

    // Crew stats: bump tasksDone when the worker is known.
    if (complaint.assignedWorkerId) {
      await db
        .update(workers)
        .set({ tasksDone: (await db.select().from(workers).where(eq(workers.id, complaint.assignedWorkerId)))[0]?.tasksDone + 1 })
        .where(eq(workers.id, complaint.assignedWorkerId));
    }

    // Karma: resolution with proof is the most valuable citizen action.
    const citizen = complaint.reporterName ?? "Anonymous Citizen";
    let karma = 0;
    if (complaint.imageUrl) karma = await awardKarma(citizen, "resolution_proof", complaint.id);

    return NextResponse.json({ complaint: updated, karmaAwarded: karma });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
