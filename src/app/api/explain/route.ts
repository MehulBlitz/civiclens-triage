import { NextResponse } from "next/server";
import { mlExplain } from "@/lib/triage/ml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Model explainability proxy — returns the feature-level evidence behind an
 * ML classification (top supporting/contradicting features + probability
 * distribution). Transparent AI for judges: no black boxes.
 */
export async function POST(req: Request) {
  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const explanation = await mlExplain(text);
  if (!explanation) {
    return NextResponse.json(
      { error: "ML explain service unavailable (L1 offline?)" },
      { status: 503 }
    );
  }
  return NextResponse.json(explanation);
}
