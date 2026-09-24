import { NextResponse } from "next/server";
import { bootstrapDb, getDb, DbUnavailableError } from "@/lib/db";
import { complaints } from "@/lib/schema";
import { triageComplaint } from "@/lib/triage";
import { persistComplaint, type PersistResult } from "@/lib/persist";
import { computeStats } from "@/lib/queries";
import type { Complaint } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemInput = {
  text?: unknown;
  imageUrl?: unknown;
  source?: unknown;
  locationHint?: unknown;
};

const SOURCES = new Set(["tweet", "email", "social", "manual", "bulk", "whatsapp", "x", "news"]);

export async function POST(req: Request) {
  let body: { items?: ItemInput[] } & ItemInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawItems: ItemInput[] = Array.isArray(body.items) ? body.items : [body];
  if (rawItems.length === 0 || rawItems.length > 20) {
    return NextResponse.json(
      { error: "Send between 1 and 20 complaints per request" },
      { status: 400 }
    );
  }

  const items = rawItems
    .map((item) => {
      const text = typeof item.text === "string" ? item.text.trim() : "";
      const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl : null;
      const source =
        typeof item.source === "string" && SOURCES.has(item.source)
          ? item.source
          : "manual";
      const locationHint =
        typeof item.locationHint === "string" ? item.locationHint.trim() : "";
      return { text, imageUrl, source, locationHint };
    })
    .filter((item) => item.text.length > 0);

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Every complaint needs non-empty text" },
      { status: 400 }
    );
  }

  try {
    await bootstrapDb();
  } catch (e) {
    const message =
      e instanceof DbUnavailableError
        ? e.message
        : `Database error: ${e instanceof Error ? e.message : "unknown"}`;
    return NextResponse.json({ error: message }, { status: 503 });
  }  const created: Complaint[] = [];
  const notes: string[] = [];
  const mergedInfo: Record<string, unknown>[] = [];
  let dbFailure: string | null = null;

  // Sequential: keeps Nominatim's free-tier rate limit happy.
  // Known photo hashes give the trust layer its duplicate-evidence check.
  const knownPhashes: string[] = [];
  try {
    const { db } = getDb();
    const recent = await db
      .select({ phash: complaints.imagePhash })
      .from(complaints)
      .limit(200);
    for (const r of recent) if (r.phash) knownPhashes.push(r.phash);
  } catch {
    // corpus phashes unavailable — duplicate check degrades to off
  }

  for (const item of items) {
    try {
      const outcome = await triageComplaint(item.text, {
        imageUrl: item.imageUrl,
        locationHint: item.locationHint,
        source: item.source,
        knownPhashes,
      });
      notes.push(...outcome.notes);
      try {
        const result: PersistResult = await persistComplaint({
          rawText: item.text,
          imageUrl: item.imageUrl,
          category: outcome.category,
          priority: outcome.priority,
          routeTo: outcome.routeTo,
          summary: outcome.summary,
          confidence: outcome.confidence,
          locationText: outcome.locationText || null,
          lat: outcome.lat,
          lng: outcome.lng,
          source: item.source,
          sourceLayer: outcome.sourceLayer,
          status: outcome.status,
          trustScore: outcome.vision?.trustScore ?? null,
          trustBand: outcome.vision?.trustBand ?? null,
          trustBreakdown: outcome.vision
            ? JSON.stringify(outcome.vision.trustBreakdown)
            : null,
          trustFlags: outcome.vision?.trustFlags.length
            ? JSON.stringify(outcome.vision.trustFlags)
            : null,
          imagePhash: outcome.vision?.imagePhash ?? null,
          cnnCategory: outcome.vision?.cnnCategory ?? null,
          cnnSeverity: outcome.vision?.cnnSeverity ?? null,
          visionSource: outcome.vision?.visionSource ?? null,
        });
        created.push(result.row);
        if (result.merged) {
          mergedInfo.push({
            id: result.row.id,
            reportCount: result.reportCount,
            escalated: result.escalated
          });
          notes.push(
            result.escalated
              ? `⚡ Crowd signal: #${result.row.id} now has ${result.reportCount} reports → auto-escalated to ${result.priority}`
              : `Crowd merge: duplicate of #${result.row.id} (now ×${result.reportCount})`
          );
        }
      } catch (e) {
        dbFailure = `Could not persist complaint: ${e instanceof Error ? e.message : "unknown"}`;
      }
    } catch (e) {
      // Pipeline is designed not to throw — belt and braces.
      dbFailure = `Triage failed: ${e instanceof Error ? e.message : "unknown"}`;
    }
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: dbFailure ?? "No complaints were created" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      complaints: created,
      merged: mergedInfo,
      stats: computeStats(created),
      notes,
      ...(dbFailure ? { warning: dbFailure } : {})
    },
    { status: 201 }
  );
}
