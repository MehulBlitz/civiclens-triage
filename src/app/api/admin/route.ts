import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints, wards } from "@/lib/schema";
import { computeStats } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  try {
    await bootstrapDb();
    const { db } = getDb();
    const [complaintRows, wardRows] = await Promise.all([
      db.select().from(complaints).orderBy(desc(complaints.createdAt)),
      db.select().from(wards).orderBy(wards.code)
    ]);
    return NextResponse.json({
      user: auth.user,
      complaints: complaintRows,
      stats: computeStats(complaintRows),
      wards: wardRows,
      citizenManagement: { wards: wardRows.length }
    });
  } catch (error) {
    const message = error instanceof DbUnavailableError ? error.message : "Database unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.user) return NextResponse.json({ error: "Administrator sign-in required" }, { status: auth.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await bootstrapDb();
    const { db } = getDb();
    if (body.type === "ward") {
      const code = String(body.code ?? "").trim().toUpperCase();
      const name = String(body.name ?? "").trim();
      const zone = String(body.zone ?? "").trim();
      if (!code || !name || !zone) return NextResponse.json({ error: "Ward code, name, and zone are required" }, { status: 400 });
      const [ward] = await db.insert(wards).values({ code, name, zone }).returning();
      return NextResponse.json({ ward }, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown admin action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}