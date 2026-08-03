import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`ALTER TABLE sponsor_profiles ADD COLUMN IF NOT EXISTS categories TEXT[]`;
  await sql`ALTER TABLE sponsor_profiles ADD COLUMN IF NOT EXISTS budget_min_cents INTEGER`;
  await sql`ALTER TABLE sponsor_profiles ADD COLUMN IF NOT EXISTS budget_max_cents INTEGER`;

  await sql`DO $$ BEGIN
    CREATE TYPE sponsorship_initiator AS ENUM ('sponsor', 'host');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS requested_by sponsorship_initiator NOT NULL DEFAULT 'sponsor'`;

  console.log('Added sponsor_profiles.categories/budget_min_cents/budget_max_cents and sponsorships.requested_by');
}

main().catch(console.error);
