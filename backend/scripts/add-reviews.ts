import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_key TEXT,
      host_rating INTEGER NOT NULL,
      venue_rating INTEGER,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT reviews_event_reviewer_unique UNIQUE (event_id, reviewer_id)
    )
  `;

  console.log('Created reviews table');
}

main().catch(console.error);
