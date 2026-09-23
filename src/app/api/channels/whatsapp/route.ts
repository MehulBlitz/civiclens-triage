import { NextResponse } from "next/server";
import { triageComplaint } from "@/lib/triage";
import { persistComplaint } from "@/lib/persist";
import { bootstrapDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Business API webhook — the official, consent-based pattern:
 *
 *   citizen messages your official number
 *     → Meta delivers a POST here (or a mock adapter in the demo)
 *     → same triage pipeline as every other channel
 *     → persisted, geocoded, clustered, routed
 *
 * GET  = Meta's webhook verification handshake (hub.challenge echo).
 * POST = real intake. Private chats are only ever received after the
 *        citizen messages the city's public number (opt-in), never scraped.
 *
 * Demo mode: without WHATSAPP_VERIFY_TOKEN set, POSTs are processed exactly
 * the same way — handy for the hackathon demo with a mock adapter.
 */

/** GET /api/channels/whatsapp?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "civiclens-demo";

  if (mode === "subscribe" && token === expected) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

type MetaMessage = {
  from?: string;
  text?: { body?: string };
  image?: { id?: string; link?: string };
};

type WhatsAppPayload = {
  from?: unknown;
  text?: unknown;
  location?: unknown;
  entry?: {
    changes: {
      value?: {
        messages?: MetaMessage[];
      };
    }[];
  }[];
};

export async function POST(req: Request) {
  let body: WhatsAppPayload;
  try {
    body = (await req.json()) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept both the demo shape ({from,text,location}) and the Meta webhook
  // shape ({entry:[{changes:[{value:{messages:[…]}]}]}]).
  const metaMsgs: MetaMessage[] = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  type Msg = { from?: string; text?: string; locationHint?: string; imageUrl?: string };
  const msgs: Msg[] =
    metaMsgs.length > 0
      ? metaMsgs.map((m) => ({
          from: m.from,
          text: m.text?.body,
          imageUrl: m.image?.link,
        }))
      : [
          {
            from: typeof body.from === "string" ? body.from : "anonymous",
            text: typeof body.text === "string" ? body.text : "",
            locationHint: typeof body.location === "string" ? body.location : "",
          },
        ];

  const valid = msgs.filter((m) => (m.text ?? "").trim().length > 0);
  if (valid.length === 0) {
    return NextResponse.json(
      { error: "No message text found in payload" },
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

  const results: { from: string; ticketId: number | null; category: string; priority: string; routedTo: string; merged: boolean }[] = [];
  for (const m of valid) {
    try {
      const outcome = await triageComplaint(m.text!, {
        imageUrl: m.imageUrl ?? null,
        locationHint: m.locationHint ?? null,
      });
      const result = await persistComplaint({
        rawText: m.text!,
        imageUrl: m.imageUrl ?? null,
        category: outcome.category,
        priority: outcome.priority,
        routeTo: outcome.routeTo,
        summary: outcome.summary,
        confidence: outcome.confidence,
        locationText: outcome.locationText || null,
        lat: outcome.lat,
        lng: outcome.lng,
        source: "whatsapp",
        sourceLayer: outcome.sourceLayer,
        status: outcome.status
      });
      results.push({
        from: m.from ?? "anonymous",
        ticketId: result.row?.id ?? null,
        category: outcome.category,
        priority: outcome.priority,
        routedTo: outcome.routeTo,
        merged: result.merged
      });
    } catch {
      results.push({
        from: m.from ?? "anonymous",
        ticketId: null,
        category: "Other",
        priority: "medium",
        routedTo: "General Grievance Cell",
        merged: false
      });
    }
  }

  return NextResponse.json({
    received: valid.length,
    triaged: results,
    note: "Citizen opt-in channel — messages to the city's official number are triaged by the same pipeline."
  }, { status: 201 });
}
