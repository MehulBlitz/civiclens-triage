import {
  boolean,
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
  /** Optional citizen display name (no auth — karma is a demo ledger). */
  reporterName: text("reporter_name"),
  /** -------- Field-ops lifecycle (worker → proof → officer verification) ---- */
  assignedWorkerId: integer("assigned_worker_id"),
  assignedWorkerName: text("assigned_worker_name"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  /** Resolution proof submitted by the field crew. */
  resolvedPhotoUrl: text("resolved_photo_url"),
  resolvedNotes: text("resolved_notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  /** Officer (or auto-policy) sign-off on the proof. */
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  /** Civic Karma points awarded to the reporter for this ticket. */
  karmaAwarded: integer("karma_awarded").notNull().default(0),
  /** Community co-signatures (petition-style pressure). */
  cosignCount: integer("cosign_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

/** Municipal field crew — claimed/assigned tasks reference these rows. */
export const workers = pgTable("workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  phone: text("phone"),
  zone: text("zone"),
  tasksDone: integer("tasks_done").notNull().default(0),
  rating: doublePrecision("rating").notNull().default(4.5)
});

/** Civic Karma ledger — every point-earning event is inspectable. */
export const karmaLedger = pgTable("karma_ledger", {
  id: serial("id").primaryKey(),
  citizen: text("citizen").notNull(),
  action: text("action").notNull(),
  points: integer("points").notNull(),
  complaintId: integer("complaint_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  provider: text("provider").notNull().default("google"),
  role: text("role").notNull().default("citizen"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true })
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});

export const wards = pgTable("wards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  zone: text("zone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});


export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type KarmaEntry = typeof karmaLedger.$inferSelect;
export type User = typeof users.$inferSelect;
export type Ward = typeof wards.$inferSelect;
