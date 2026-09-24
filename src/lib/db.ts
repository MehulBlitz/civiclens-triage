import {
  neon,
  type NeonQueryFunction
} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { complaints } from "./schema";

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
  const db = drizzle(client, { schema: { complaints } });
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
  `ALTER TABLE complaints ADD COLUMN IF NOT EXISTS vision_source text`
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
  if (existing.length > 0) return;
  const { SEED_ROWS } = await import("./seed");
  await db.insert(complaints).values(SEED_ROWS).onConflictDoNothing({ target: complaints.id });
  await client(SYNC_SEQUENCE);
}

/** Idempotent bootstrap: table exists + migrations + demo data present. */
export async function bootstrapDb(): Promise<void> {
  await ensureTable();
  await migrate();
  await seedIfEmpty();
}
