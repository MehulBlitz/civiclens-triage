import { NextResponse } from "next/server";
import { loadComplaints } from "@/lib/queries";
import {
  buildSituations,
  applyHistorical,
  enrichWithWeather,
  describeSituation,
} from "@/lib/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Risk API — the Civic Incident Neural Network in action.
 *
 * Layered like the rest of the pipeline, and honest about provenance:
 *   1. spatial clustering of open complaints into "situations"
 *   2. feature engineering (10 real features; rainfall via Open-Meteo)
 *   3. neural net prediction + hand-written rule baseline side by side
 *   4. any failure degrades to fewer situations / no weather — never throws
 */
export async function GET() {
  try {
    const { complaints, dbError } = await loadComplaints();
    if (dbError) {
      return NextResponse.json(
        { situations: [], citywide: null, dbError, updatedAfter: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    let { situations, citywide } = buildSituations(complaints);
    situations = applyHistorical(situations, complaints);
    situations = await enrichWithWeather(situations);

    const payload = {
      situations: situations.slice(0, 8).map((s) => ({
        id: s.id,
        anchorId: s.anchor.id,
        category: s.anchor.category,
        priority: s.anchor.priority,
        location: s.anchor.locationText,
        lat: s.anchor.lat,
        lng: s.anchor.lng,
        complaintCount: s.complaintCount,
        accidentCount: s.accidentCount,
        crowdWeight: Math.round(s.crowdWeight * 10) / 10,
        level: s.prediction.level,
        probabilities: s.prediction.probabilities,
        baselineLevel: s.prediction.baselineLevel,
        sourceLayer: s.prediction.sourceLayer,
        topSignals: s.prediction.topSignals,
        explanation: describeSituation(s),
        rainfallMm: s.weather?.rainfall24hMm ?? null,
        memberIds: s.memberIds,
        features: s.features,
      })),
      citywide: citywide
        ? {
            id: citywide.id,
            complaintCount: citywide.complaintCount,
            level: citywide.prediction.level,
            probabilities: citywide.prediction.probabilities,
            baselineLevel: citywide.prediction.baselineLevel,
            sourceLayer: citywide.prediction.sourceLayer,
            topSignals: citywide.prediction.topSignals,
          }
        : null,
      dbError: null,
      updatedAfter: new Date().toISOString(),
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        situations: [],
        citywide: null,
        dbError: null,
        error: e instanceof Error ? e.message : "Risk engine failure",
        updatedAfter: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
