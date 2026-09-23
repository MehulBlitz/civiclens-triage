import { NextResponse } from "next/server";
import { triageComplaint } from "@/lib/triage";
import { persistComplaint } from "@/lib/persist";
import { bootstrapDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * X / Twitter intake — official-API pattern, no scraping.
 *
 * In production this route is called by your own poller that pulls recent
 * posts from the X API (search of public posts with keyword/location filters)
 * and forwards them here. Public posts are treated as *signals requiring
 * corroboration*: they enter the pipeline like any other raw text and can be
 * downgraded to needs_review by the confidence threshold.
 *
 * Demo: the same JSON shape works with the LiveFeed or any client —
 *   POST /api/channels/x  { "posts": [{ "id": "...", "text": "...", "author": "…" }] }
 */

type XPost = {
  id?: string;
  text?: unknown;
  author?: string;
  locationHint?: string;
};

export async function POST(req: Request) {
  let body: { posts?: XPost[] };
  try {
    body = (await req.json()) as { posts?: XPost[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const posts = (body.posts ?? [])
    .map((p) => ({
      id: p.id ?? null,
      text: typeof p.text === "string" ? p.text.trim() : "",
      author: p.author ?? "unknown",
      locationHint: p.locationHint ?? null,
    }))
    .filter((p) => p.text.length > 0)
    .slice(0, 20);

  if (posts.length === 0) {
    return NextResponse.json(
      { error: "Provide posts: [{ text, author?, locationHint? }] (max 20)" },
      { status: 400 }
    );
  }

  try {
    await bootstrapDb();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Database unavailable" },
      { status: 503 }
    );
  }

  const results: { author: string; ticketId: number | null; category: string; priority: string; needsReview: boolean; merged: boolean }[] = [];

  for (const p of posts) {
    try {
      const outcome = await triageComplaint(p.text, {
        locationHint: p.locationHint
      });
      const result = await persistComplaint({
        rawText: p.text,
        imageUrl: null,
        category: outcome.category,
        priority: outcome.priority,
        routeTo: outcome.routeTo,
        summary: outcome.summary,
        confidence: outcome.confidence,
        locationText: outcome.locationText || null,
        lat: outcome.lat,
        lng: outcome.lng,
        source: "x",
        sourceLayer: outcome.sourceLayer,
        status: outcome.status
      });
      results.push({
        author: p.author,
        ticketId: result.row?.id ?? null,
        category: outcome.category,
        priority: outcome.priority,
        needsReview: outcome.status === "needs_review",
        merged: result.merged
      });
    } catch {
      results.push({
        author: p.author,
        ticketId: null,
        category: "Other",
        priority: "medium",
        needsReview: true,
        merged: false
      });
    }
  }

  return NextResponse.json(
    {
      received: posts.length,
      triaged: results,
      note: "Public posts are signals, not facts — low-confidence ones land in the manual review queue."
    },
    { status: 201 }
  );
}
