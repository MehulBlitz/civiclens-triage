import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, bootstrapDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";
import { STATUSES } from "@/lib/civic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid complaint id" }, { status: 400 });
  }

  let status: unknown;
  try {
    ({ status } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof status !== "string" || !STATUSES.includes(status as never)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await bootstrapDb();
    const { db } = getDb();
    const rows = await db
      .update(complaints)
      .set({ status })
      .where(eq(complaints.id, id))
      .returning();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }
    return NextResponse.json({ complaint: rows[0] });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
