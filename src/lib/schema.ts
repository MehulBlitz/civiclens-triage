import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const complaints = pgTable("complaints", {
  id: serial("id").primaryKey(),
  rawText: text("raw_text").notNull(),
  imageUrl: text("image_url"),
  category: text("category").notNull(),
  priority: text("priority").notNull(),
  routeTo: text("route_to").notNull(),
  summary: text("summary").notNull(),
  confidence: doublePrecision("confidence")
    .notNull()
    .default(0),
  locationText: text("location_text"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  source: text("source")
    .notNull()
    .default("manual"),
  sourceLayer: text("source_layer")
    .notNull()
    .default("rules"),
  status: text("status")
    .notNull()
    .default("open"),
  /** Number of near-identical citizen reports merged into this master row. */
  reportCount: integer("report_count").notNull().default(1),
  /** Raw texts of merged duplicates (newline-separated, for transparency).
   *  Truncated to 120 chars each so the row stays small. */
  duplicateTexts: text("duplicate_texts"),
  /** Set when auto-escalation fired (duplicate count crossed threshold). */
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  /** Composite 0-1 evidence trust score (forensics + consistency + context). */
  trustScore: doublePrecision("trust_score"),
  /** Trust band: high | medium | low | untrusted. */
  trustBand: text("trust_band"),
  /** Per-component breakdown (image forensics, consistency, geo, crowd...). */
  trustBreakdown: text("trust_breakdown"),
  /** Inspection flags: edited_software, ela_hotspots, photo_reused... */
  trustFlags: text("trust_flags"),
  /** 64-bit DCT perceptual hash — recognizes reused photos across reports. */
  imagePhash: text("image_phash"),
  /** CNN photo category + severity (evidence analyzed, not just stored). */
  cnnCategory: text("cnn_category"),
  cnnSeverity: doublePrecision("cnn_severity"),
  /** Which stack produced the image signals: python_service | ts_local | unavailable. */
  visionSource: text("vision_source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
