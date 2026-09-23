/**
 * Feature engineering for the Civic Incident Neural Network.
 *
 * buildRiskFeatures mirrors — field for field — the input layer defined in
 * ml/train_nn.py. Any change here must be mirrored there (and vice versa),
 * and the bundle retrained.
 */

export type RiskFeatureInput = {
  /** Signals + complaints merged into this incident. */
  complaintCount: number;
  /** Complaint growth: reports in last 6h / reports in prior 18h (clamped 0-3). */
  growthRate: number;
  /** 0-1 severity derived from priority + escalated state. */
  severity: number;
  /** 0-1, mean authenticity of the merged signals (0 when none). */
  imageConfidence: number;
  /** Count of reports whose text mentions accidents/injuries. */
  accidentCount: number;
  /** Open-Meteo rainfall mm over the next 24h (0 when unavailable). */
  rainfall: number;
  /** 0-1 traffic level (rush-hour proxy from local time). */
  trafficLevel: number;
  /** Historical incident count in the same area (last 30 days). */
  historicalIncidents: number;
  /** km to the nearest other open incident (99 when none). */
  distanceToPreviousIncident: number;
  /** Sine-encoded hour-of-day, 0-1. */
  timeOfDay: number;
};

/** Output classes — index = MLP output row. */
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Local-time traffic proxy: bimodal rush-hour curve. */
export function trafficLevelForHour(hour: number): number {
  const morning = Math.exp(-((hour - 9.5) ** 2) / 6);
  const evening = Math.exp(-((hour - 18) ** 2 / 6));
  return clamp01(Math.max(morning, evening) * 1.15);
}

/** Sine encoding of hour-of-day so 23:00 is near 23:00+1:00. */
export function timeOfDayEncoding(hour: number): number {
  return (1 - Math.cos((2 * Math.PI * hour) / 24)) / 2;
}

/**
 * The 10-element input vector in the exact order the MLP expects.
 */
export function buildRiskFeatures(i: RiskFeatureInput): number[] {
  return [
    Math.max(0, i.complaintCount), // complaint_count
    clamp01(i.growthRate / 3), // complaint_growth_rate
    clamp01(i.severity), // severity
    clamp01(i.imageConfidence), // image_confidence
    Math.min(5, i.accidentCount) / 5, // accident_count
    Math.min(50, i.rainfall) / 50, // rainfall (normalized mm/24h)
    clamp01(i.trafficLevel), // traffic_level
    Math.min(20, i.historicalIncidents) / 20, // historical_incidents
    Math.min(1, i.distanceToPreviousIncident / 5), // distance_to_previous_incident
    clamp01(i.timeOfDay), // time_of_day
  ];
}

/** Human labels used by the explain panel. */
export const RISK_FEATURE_LABELS: Record<keyof RiskFeatureInput, string> = {
  complaintCount: "Complaint volume",
  growthRate: "Complaint acceleration",
  severity: "Severity",
  imageConfidence: "Evidence quality",
  accidentCount: "Accident reports",
  rainfall: "Rainfall forecast",
  trafficLevel: "Traffic level",
  historicalIncidents: "Historical recurrence",
  distanceToPreviousIncident: "Distance to nearest incident",
  timeOfDay: "Time of day",
};
