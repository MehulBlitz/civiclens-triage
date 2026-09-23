import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { loadComplaints } from "@/lib/queries";
import { getDb, bootstrapDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadComplaints();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" }
  });
}

/** Delete complaints (spam / duplicates) — ids must be provided explicitly. */
export async function DELETE(req: Request) {
  let ids: unknown;
  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((i) => Number.isInteger(i))
  ) {
    return NextResponse.json(
      { error: "Provide a non-empty array of integer ids" },
      { status: 400 }
    );
  }
  try {
    await bootstrapDb();
    const { db } = getDb();
    await db.delete(complaints).where(inArray(complaints.id, ids as number[]));
    return NextResponse.json({ deleted: ids.length });
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
