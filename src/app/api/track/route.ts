import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/track?id=N — public complaint lookup (no auth): status, SLA,
 * assignment, resolution proof and verification. Powers the /track page
 * where any citizen follows their ticket.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Provide a numeric ticket id, e.g. /api/track?id=12" }, { status: 400 });
  }

  try {
    await bootstrapDb();
    const { db } = getDb();
    const [row] = await db.select().from(complaints).where(eq(complaints.id, id));
    if (!row) {
      return NextResponse.json({ error: `Ticket #${id} not found` }, { status: 404 });
    }
    return NextResponse.json({ complaint: row });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
