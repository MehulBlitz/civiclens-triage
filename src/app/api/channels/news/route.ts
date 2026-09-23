import { NextResponse } from "next/server";
import { triageComplaint } from "@/lib/triage";
import { persistComplaint } from "@/lib/persist";
import { bootstrapDb } from "@/lib/db";
import { classifyLexical } from "@/lib/triage/lexical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * News / RSS intake — the easiest external signal, fully free.
 *
 * GET  /api/channels/news          → fetches city news RSS feeds, pre-filters
 *                                    for civic-relevance with the lexical
 *                                    engine, and returns candidates WITHOUT
 *                                    persisting (for moderation).
 * POST /api/channels/news          → triage + persist the accepted items.
 *
 * Demo default feeds are free RSS (The Hindu Cities, TOI Bengaluru, Deccan
 * Herald). Replace/extend via the CIVIC_NEWS_FEEDS env var (comma-separated
 * URLs). Civic-relevance pre-filtering keeps junk news out of the queue.
 */

const DEFAULT_FEEDS = [
  "https://www.thehindu.com/news/cities/bangalore/feeder/default.rss",
  "https://timesofindia.indiatimes.com/city/bengaluru/rssfeedstopstories.cms",
];

/** Extract plain-text <item> fields from an RSS/Atom document. */
function parseFeed(xml: string): { title: string; description: string; link: string }[] {
  const items: { title: string; description: string; link: string }[] = [];
  const itemRe = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g;
  const strip = (s: string) =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  for (const raw of xml.matchAll(itemRe)) {
    const block = raw[0];
    const tag = (name: string) => {
      const m = block.match(
        new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")
      );
      return m ? strip(m[1]) : "";
    };
    const title = tag("title");
    if (title) items.push({ title, description: tag("description").slice(0, 600), link: tag("link") });
  }
  return items;
}

const CIVIC_HINTS = [
  "pothole", "drain", "flood", "waterlog", "garbage", "waste", "sewage",
  "manhole", "water supply", "pipeline", "streetlight", "power cut",
  "civic", "municipal", "corporation", "bbmp", "ward", "encroachment",
  "footpath", "traffic", "sinkhole", "leak",
];

export async function GET() {
  const feeds = (process.env.CIVIC_NEWS_FEEDS ?? DEFAULT_FEEDS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const candidates: { title: string; description: string; link: string; civicScore: number }[] = [];

  for (const feed of feeds.slice(0, 3)) {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "CivicLens/1.0 (civic news watcher)" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store"
      });
      if (!res.ok) continue;
      const xml = await res.text();
      for (const item of parseFeed(xml).slice(0, 15)) {
        const hay = `${item.title} ${item.description}`.toLowerCase();
        const civicScore = CIVIC_HINTS.reduce((n, k) => (hay.includes(k) ? n + 1 : n), 0);
        if (civicScore > 0) {
          candidates.push({ ...item, civicScore });
        }
      }
    } catch {
      // Feed unreachable — skip, never fail the endpoint.
    }
  }

  // Sort by civic relevance, cap the response.
  candidates.sort((a, b) => b.civicScore - a.civicScore);
  return NextResponse.json(
    {
      candidates: candidates.slice(0, 12),
      feeds,
      note: "Civic-relevant news candidates (not persisted). POST selected items to triage them."
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  let body: { items?: { title?: unknown; description?: unknown; locationHint?: unknown }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = (body.items ?? [])
    .map((i) => ({
      title: typeof i.title === "string" ? i.title.trim() : "",
      description: typeof i.description === "string" ? i.description.trim() : "",
      locationHint: typeof i.locationHint === "string" ? i.locationHint.trim() : ""
    }))
    .filter((i) => i.title.length > 0)
    .slice(0, 10);

  if (items.length === 0) {
    return NextResponse.json({ error: "Provide items: [{ title, description? }]" }, { status: 400 });
  }

  try {
    await bootstrapDb();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Database unavailable" },
      { status: 503 }
    );
  }

  const created: number[] = [];
  for (const item of items) {
    // News headlines are terse — prepend the description so the classifier
    // has enough context. Lexical relevance re-check keeps junk out.
    const text = `${item.title}. ${item.description}`.slice(0, 1000);
    const matchInfo = { hits: 0 };
    classifyLexical(text, matchInfo);
    if (matchInfo.hits === 0) continue;

    const outcome = await triageComplaint(text, { locationHint: item.locationHint });
    const result = await persistComplaint({
      rawText: text,
      imageUrl: null,
      category: outcome.category,
      priority: outcome.priority,
      routeTo: outcome.routeTo,
      summary: outcome.summary,
      confidence: outcome.confidence,
      locationText: outcome.locationText || null,
      lat: outcome.lat,
      lng: outcome.lng,
      source: "news",
      sourceLayer: outcome.sourceLayer,
      status: outcome.status
    });
    if (result.row) created.push(result.row.id);
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
