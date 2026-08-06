import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      event_id UUID REFERENCES events(id) ON DELETE CASCADE,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      radius_miles INTEGER NOT NULL DEFAULT 100,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('Created notifications, notification_prefs and added users.last_lat/last_lng/location_updated_at');
}

main().catch(console.error);
