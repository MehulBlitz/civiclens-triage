import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints, workers } from "@/lib/schema";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assign — route a complaint to a field worker (the "officer
 * dispatch" step). Auto-picks the best-matching worker by department when
 * no workerId is supplied. Status moves open → assigned.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  let body: { complaintId?: unknown; workerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const complaintId = Number(body.complaintId);
  if (!Number.isInteger(complaintId)) {
    return NextResponse.json({ error: "complaintId must be an integer" }, { status: 400 });
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
    if (complaint.status === "resolved") {
      return NextResponse.json({ error: "Complaint already resolved" }, { status: 409 });
    }

    // Pick the requested worker, or auto-match by department.
    let worker = null as typeof workers.$inferSelect | null;
    if (Number.isInteger(Number(body.workerId))) {
      const [w] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, Number(body.workerId)));
      worker = w ?? null;
    }
    if (!worker) {
      const deptWorkers = await db
        .select()
        .from(workers)
        .where(eq(workers.department, complaint.routeTo));
      const pool = deptWorkers.length
        ? deptWorkers
        : await db.select().from(workers);
      // Least-loaded first — simple, transparent dispatch policy.
      worker = pool.sort((a, b) => a.tasksDone - b.tasksDone)[0] ?? null;
    }
    if (!worker) {
      return NextResponse.json(
        { error: "No field workers registered — seed data missing" },
        { status: 503 }
      );
    }

    const [updated] = await db
      .update(complaints)
      .set({
        status: "assigned",
        assignedWorkerId: worker.id,
        assignedWorkerName: worker.name,
        assignedAt: new Date()
      })
      .where(eq(complaints.id, complaintId))
      .returning();

    return NextResponse.json({ complaint: updated, worker });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

/** GET /api/assign — open pool for the worker portal (unassigned tickets). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  try {
    await bootstrapDb();
    const { db } = getDb();
    const pool = await db
      .select()
      .from(complaints)
      .where(and(eq(complaints.status, "open"), ne(complaints.status, "resolved")));
    const crew = await db.select().from(workers);
    return NextResponse.json({ pool, workers: crew });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
