import { NextResponse } from "next/server";
import { desc, ilike, or } from "drizzle-orm";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=... — global complaint search for the command palette.
 * Matches summary, raw text, location, category and department.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const like = `%${q}%`;

  try {
    await bootstrapDb();
    const { db } = getDb();
    const rows = await db
      .select({
        id: complaints.id,
        summary: complaints.summary,
        category: complaints.category,
        priority: complaints.priority,
        status: complaints.status,
        locationText: complaints.locationText,
        routeTo: complaints.routeTo
      })
      .from(complaints)
      .where(
        or(
          ilike(complaints.summary, like),
          ilike(complaints.rawText, like),
          ilike(complaints.locationText, like),
          ilike(complaints.category, like),
          ilike(complaints.routeTo, like)
        )
      )
      .orderBy(desc(complaints.createdAt))
      .limit(12);
    return NextResponse.json({ results: rows });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
