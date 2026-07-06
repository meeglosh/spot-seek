import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    DO $$ BEGIN
      CREATE TYPE sponsorship_status AS ENUM ('pending','active','rejected','cancelled','completed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

  await sql`
    CREATE TABLE IF NOT EXISTS sponsor_profiles (
      id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      website TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS sponsorships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sponsor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      status sponsorship_status NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS sponsor_offers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sponsorship_id UUID NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      promo_code TEXT,
      discount_cents INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  console.log('Created Phase 3 tables: sponsor_profiles, sponsorships, sponsor_offers');
}

main().catch(console.error);
