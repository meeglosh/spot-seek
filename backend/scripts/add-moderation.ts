import { neon } from '@neondatabase/serverless';

// Event moderation (Apple guideline 1.2). Additive only: new columns/tables,
// all IF NOT EXISTS. Safe to re-run. events.status is a pg enum
// (event_status), so moderation lives in a separate text column and the
// publishing semantics are untouched.
async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'ok'
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE events ADD CONSTRAINT events_moderation_status_check
        CHECK (moderation_status IN ('ok','flagged','hidden','removed'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS event_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK (reason IN ('hate','harassment','sexual','violence','spam','other')),
      note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT event_reports_event_reporter_unique UNIQUE (event_id, reporter_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (blocker_id, blocked_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id)`;

  // No FK on event_id: the log must outlive a deleted event.
  await sql`
    CREATE TABLE IF NOT EXISTS moderation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID,
      action TEXT NOT NULL CHECK (action IN ('auto_hidden','auto_flagged','blocked_on_publish','restored','removed')),
      reason TEXT,
      actor TEXT NOT NULL CHECK (actor IN ('system','admin')),
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS moderation_events_event_idx ON moderation_events (event_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS events_moderation_status_idx ON events (moderation_status) WHERE moderation_status <> 'ok'`;

  // Once-a-day digest guard (one row per UTC day).
  await sql`
    CREATE TABLE IF NOT EXISTS moderation_digests (
      day TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('Moderation migration applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
