import {
  neon,
  type NeonQueryFunction
} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { complaints, workers, karmaLedger, users, sessions, wards } from "./schema";

export class DbUnavailableError extends Error {}

type DbHandle = {
  client: NeonQueryFunction<false, false>;
  db: ReturnType<typeof drizzle>;
};

let cached: DbHandle | null = null;

function createDb(): DbHandle {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DbUnavailableError(
      "DATABASE_URL is not set — connect a Neon database in Settings → Environment."
    );
  }
  const client = neon(url);
  const db = drizzle(client, { schema: { complaints, workers, karmaLedger, users, sessions, wards } });
  return { client, db };
}

export function getDb(): DbHandle {
  if (!cached) cached = createDb();
  return cached;
}

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS complaints (
  id serial PRIMARY KEY,
  raw_text text NOT NULL,
  image_url text,
  category text NOT NULL,
  priority text NOT NULL,
  route_to text NOT NULL,
  summary text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0,
  location_text text,
  lat double precision,
  lng double precision,
  source text NOT NULL DEFAULT 'manual',
  source_layer text NOT NULL DEFAULT 'rules',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  trust_score double precision,
  trust_band text,
  trust_breakdown text,
  trust_flags text,
  image_phash text,
  cnn_category text,
  cnn_severity double precision,
  vision_source text
)`;

const MIGRATIONS = [
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 1`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS duplicate_texts text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated_at timestamptz`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS trust_score double precision`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS trust_band text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS trust_breakdown text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS trust_flags text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS image_phash text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS cnn_category text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS cnn_severity double precision`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS vision_source text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS reporter_name text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_worker_id integer`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_worker_name text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_at timestamptz`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_photo_url text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_notes text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_at timestamptz`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS verified_at timestamptz`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS verified_by text`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS karma_awarded integer NOT NULL DEFAULT 0`,
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS cosign_count integer NOT NULL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS workers (
    id serial PRIMARY KEY,
    name text NOT NULL,
    department text NOT NULL,
    phone text,
    zone text,
    tasks_done integer NOT NULL DEFAULT 0,
    rating double precision NOT NULL DEFAULT 4.5
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text,
    avatar_url text,
    provider text NOT NULL DEFAULT 'google',
    role text NOT NULL DEFAULT 'citizen',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY,
    user_id integer NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS wards (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    zone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS karma_ledger (
    id serial PRIMARY KEY,
    citizen text NOT NULL,
    action text NOT NULL,
    points integer NOT NULL,
    complaint_id integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
];

/** Additive migrations — safe to run on every boot. */
export async function migrate(): Promise<void> {
  const { client } = getDb();
  for (const sql of MIGRATIONS) {
    await client(sql);
  }
}

const SYNC_SEQUENCE = `
SELECT setval(
  pg_get_serial_sequence('complaints', 'id'),
  COALESCE((SELECT MAX(id) FROM complaints), 1)
)`;

/** Create the complaints table if it does not exist yet. */
export async function ensureTable(): Promise<void> {
  const { client } = getDb();
  await client(CREATE_TABLE);
}

/** Insert demo rows only when the table has no rows; keeps ids deterministic. */
export async function seedIfEmpty(): Promise<void> {
  const { client, db } = getDb();
  const existing = await db
    .select({ id: complaints.id })
    .from(complaints)
    .limit(1);
  if (existing.length === 0) {
    const { SEED_ROWS } = await import("./seed");
    await db.insert(complaints).values(SEED_ROWS).onConflictDoNothing({ target: complaints.id });
    await client(SYNC_SEQUENCE);
  }
  // Crew + karma seed independently — they back the worker/officer/karma
  // pages even on databases that already carry complaint data.
  const workerRows = await db.select({ id: workers.id }).from(workers).limit(1);
  if (workerRows.length === 0) {
    const { SEED_WORKERS } = await import("./seed");
    await db.insert(workers).values(SEED_WORKERS).onConflictDoNothing();
  }
  const karmaRows = await db.select({ id: karmaLedger.id }).from(karmaLedger).limit(1);
  if (karmaRows.length === 0) {
    const { SEED_KARMA } = await import("./seed");
    await db.insert(karmaLedger).values(SEED_KARMA).onConflictDoNothing();
  }
}

/** Idempotent bootstrap: table exists + migrations + demo data present. */
export async function bootstrapDb(): Promise<void> {
  await ensureTable();
  await migrate();
  await seedIfEmpty();
}
