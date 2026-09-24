import { NextResponse } from "next/server";
import { mlHealth } from "@/lib/triage/ml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostics for the demo: env key presence (names only, never values),
 * Python ML service reachability + training metrics, and geocoder status.
 */
export async function GET() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
    UPLOADTHING_SECRET: process.env.UPLOADTHING_SECRET ? "set" : "missing",
    UPLOADTHING_APP_ID: process.env.UPLOADTHING_APP_ID ? "set" : "missing",
    ML_SERVICE_URL: process.env.ML_SERVICE_URL ? "set" : "default (127.0.0.1:8008)"
  };

  const ml = await mlHealth();
  const mlStatus = ml
    ? ml.model_loaded
      ? "ready"
      : "no_model"
    : "unreachable";

  // Vision layer status: Python CNN/forensics when the service exposes them,
  // otherwise the always-available TS fallback chain.
  const vision =
    ml && typeof ml === "object" && "cnn_loaded" in ml && ml.cnn_loaded
      ? "python_service"
      : "ts_local";

  return NextResponse.json({
    status: mlStatus === "ready" && env.DATABASE_URL === "set" ? "ok" : "degraded",
    env,
    ml: {
      status: mlStatus,
      ...(ml ?? {}),
      url: process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8008"
    },
    vision: {
      status: vision,
      cnnCategories: 8,
      trustLayers: ["python_forensics", "ts_local_forensics", "no_signals"]
    }
  });
}
