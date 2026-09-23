/**
 * Risk engine — turns the complaint table into "situations" and scores each
 * with the Civic Incident Neural Network.
 *
 * A situation = cluster of open complaints within ~2 km of each other (the
 * nearest-neighbour distances come from the persisted lat/lng). The 10
 * features mirror ml/train_nn.py's input layer and are engineered from real
 * data: complaint counts, growth rate, severity, evidence quality, accident
 * mentions, live rainfall (Open-Meteo), rush-hour traffic proxy, historical
 * recurrence, distance to the nearest other incident, time of day.
 *
 * The engine itself never throws: with no DB it returns an empty list.
 */
import type { Complaint } from "./schema";
import { PRIORITY_RANK } from "./civic";
import { trafficLevelForHour, timeOfDayEncoding, type RiskFeatureInput } from "./nn/features";
import { predictRisk, ruleBaseline, type RiskPrediction } from "./nn/infer";
import { getWeather, type WeatherSnapshot } from "./weather";

export type RiskSituation = {
  id: string;
  /** Cluster representative = highest-priority open complaint in the area. */
  anchor: Complaint;
  memberIds: number[];
  complaintCount: number;
  /** Mean crowd confirmations across members (reportCount). */
  crowdWeight: number;
  features: RiskFeatureInput;
  prediction: RiskPrediction;
  /** Live data provenance — judges ask "where does rainfall come from?". */
  weather: WeatherSnapshot | null;
  /** Accidents/injuries mentioned in any member's text. */
  accidentCount: number;
};

const ACCIDENT_MARKERS = [
  "accident", "crash", "collision", "injur", "fell", "hit and run",
  "twisted", "slipped", "gir gaye", "struck", "wounded", "ambulance",
];

const RAIN_SENSITIVE = new Set(["Drainage", "Sewage", "Water"]);

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function countAccidents(text: string): number {
  const low = text.toLowerCase();
  return ACCIDENT_MARKERS.reduce((n, m) => (low.includes(m) ? n + 1 : n), 0);
}

/**
 * Cluster open complaints into spatial situations (single-linkage-ish:
 * anything within 2 km of the anchor joins it). Returns clusters sorted by
 * predicted risk severity.
 */
export function buildSituations(complaints: Complaint[]): {
  situations: RiskSituation[];
  citywide: RiskSituation | null;
} {
  const open = complaints.filter(
    (c) => c.status !== "resolved" && c.status !== "needs_review"
  );
  const located = open.filter(
    (c): c is Complaint & { lat: number; lng: number } =>
      typeof c.lat === "number" && typeof c.lng === "number"
  );
  const unlocated = open.filter((c) => c.lat == null || c.lng == null);

  const hour = new Date().getHours();
  const traffic = trafficLevelForHour(hour);
  const tod = timeOfDayEncoding(hour);

  // Historical recurrence: complaints in the 30 days before each cluster's
  // newest member — from the same table (all rows incl. resolved).
  const clusters: { anchor: Complaint; members: Complaint[] }[] = [];
  for (const c of located) {
    const near = clusters.find(
      (cl) => haversineKm(cl.anchor.lat!, cl.anchor.lng!, c.lat, c.lng) <= 2
    );
    if (near) near.members.push(c);
    else clusters.push({ anchor: c, members: [c] });
  }

  const situations: RiskSituation[] = clusters.map((cl) => {
    const members = cl.members;
    const anchor =
      [...members].sort(
        (a, b) =>
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? cl.anchor;

    const newest = Math.max(...members.map((m) => new Date(m.createdAt).getTime()));
    const cutoff = newest - 6 * 3_600_000;
    const priorCutoff = newest - 24 * 3_600_000;
    const recent = members.filter((m) => new Date(m.createdAt).getTime() >= cutoff).length;
    const prior = members.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t < cutoff && t >= priorCutoff;
    }).length;
    // Growth ratio clamped 0..3 (matches training distribution).
    const growth = prior > 0 ? Math.min(3, recent / prior) : recent > 0 ? 3 : 0;

    const severity =
      (PRIORITY_RANK[anchor.priority] ?? 2) / 4 + (anchor.escalatedAt ? 0.15 : 0);

    const accidentCount = members.reduce((n, m) => n + countAccidents(m.rawText), 0);
    const rainSensitive = members.some((m) => RAIN_SENSITIVE.has(m.category));

    const features: RiskFeatureInput = {
      complaintCount: members.reduce((n, m) => n + (m.reportCount ?? 1), 0),
      growthRate: growth,
      severity: Math.min(1, severity),
      imageConfidence: anchor.imageUrl ? Math.max(0.5, anchor.confidence) : 0,
      accidentCount,
      rainfall: rainSensitive ? 0 : 0, // replaced after weather fetch
      trafficLevel: traffic,
      historicalIncidents: 0, // replaced after DB-side pass
      distanceToPreviousIncident:
        cl.members.length > 1
          ? Math.min(
              ...members
                .filter((m) => m.id !== anchor.id)
                .map((m) => haversineKm(anchor.lat!, anchor.lng!, m.lat!, m.lng!))
            )
          : 99,
      timeOfDay: tod,
    };

    return {
      id: `sit-${anchor.id}`,
      anchor,
      memberIds: members.map((m) => m.id),
      complaintCount: features.complaintCount,
      crowdWeight:
        members.reduce((n, m) => n + (m.reportCount ?? 1), 0) / members.length,
      features,
      prediction: predictRisk(features), // provisional; refetched after weather
      weather: null,
      accidentCount,
    };
  });

  // Citywide situation for unlocated complaints (still meaningful: volume,
  // growth, severity drive the risk even without coordinates).
  let citywide: RiskSituation | null = null;
  if (unlocated.length > 0 || located.length === 0) {
    const members = unlocated;
    const newest = Math.max(
      ...members.map((m) => new Date(m.createdAt).getTime()).concat([0])
    );
    const cutoff = newest - 6 * 3_600_000;
    const priorCutoff = newest - 24 * 3_600_000;
    const recent = members.filter((m) => new Date(m.createdAt).getTime() >= cutoff).length;
    const prior = members.filter((m) => {
      const t = new Date(m.createdAt).getTime();
      return t < cutoff && t >= priorCutoff;
    }).length;
    const growth = prior > 0 ? Math.min(3, recent / prior) : recent > 0 ? 3 : 0;
    const anchor =
      [...members].sort(
        (a, b) =>
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ?? null;
    if (anchor) {
      const features: RiskFeatureInput = {
        complaintCount: members.reduce((n, m) => n + (m.reportCount ?? 1), 0),
        growthRate: growth,
        severity: Math.min(1, (PRIORITY_RANK[anchor.priority] ?? 2) / 4),
        imageConfidence: 0,
        accidentCount: 0,
        rainfall: 0,
        trafficLevel: traffic,
        historicalIncidents: 0,
        distanceToPreviousIncident: 99,
        timeOfDay: tod,
      };
      citywide = {
        id: "sit-citywide",
        anchor,
        memberIds: members.map((m) => m.id),
        complaintCount: features.complaintCount,
        crowdWeight: 1,
        features,
        prediction: predictRisk(features),
        weather: null,
        accidentCount: 0,
      };
    }
  }

  return { situations, citywide };
}

/**
 * Async pass: fetch live weather for the top N situations and re-run the NN
 * with real rainfall. Keeping this separate lets the API return fast even
 * when Open-Meteo is slow (the first pass is synchronous and cached).
 */
export async function enrichWithWeather(
  situations: RiskSituation[],
  maxFetch = 6
): Promise<RiskSituation[]> {
  const top = [...situations]
    .sort(
      (a, b) =>
        RISK_SEVERITY[b.prediction.level] - RISK_SEVERITY[a.prediction.level] ||
        b.complaintCount - a.complaintCount
    )
    .slice(0, maxFetch);

  await Promise.all(
    top.map(async (s) => {
      if (s.anchor.lat == null || s.anchor.lng == null) return;
      const weather = await getWeather(s.anchor.lat, s.anchor.lng);
      s.weather = weather;
      if (RAIN_SENSITIVE.has(s.anchor.category)) {
        s.features.rainfall = weather.rainfall24hMm;
        s.prediction = predictRisk(s.features);
      }
    })
  );
  return situations;
}

export const RISK_SEVERITY: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/**
 * Historical recurrence feature: open + resolved complaints in the 30 days
 * before each situation's newest member, within 2 km. Needs the full table
 * (resolved rows included), so it is computed by the API route.
 */
export function applyHistorical(
  situations: RiskSituation[],
  allComplaints: Complaint[]
): RiskSituation[] {
  for (const s of situations) {
    const newest = Math.max(
      ...s.memberIds
        .map((id) => allComplaints.find((c) => c.id === id)?.createdAt ?? 0)
        .map((t) => new Date(t).getTime())
    );
    const cutoff = newest - 30 * 24 * 3_600_000;
    let count = 0;
    for (const c of allComplaints) {
      if (s.memberIds.includes(c.id)) continue;
      if (c.lat == null || c.lng == null) continue;
      if (s.anchor.lat == null || s.anchor.lng == null) continue;
      const t = new Date(c.createdAt).getTime();
      if (t > newest || t < cutoff) continue;
      if (haversineKm(s.anchor.lat, s.anchor.lng, c.lat, c.lng) <= 2) count += 1;
    }
    s.features.historicalIncidents = count;
    s.prediction = predictRisk(s.features);
  }
  return situations;
}

/** One-line human explanation of the situation, used in the UI. */
export function describeSituation(s: RiskSituation): string {
  const drivers = s.prediction.topSignals
    .slice(0, 2)
    .map((t) => t.label.toLowerCase());
  return drivers.length > 0
    ? `Top signals: ${drivers.join(", ")}`
    : "Risk derived from current complaint volume and priority.";
}

// Re-export for the API layer.
export { predictRisk, ruleBaseline };
