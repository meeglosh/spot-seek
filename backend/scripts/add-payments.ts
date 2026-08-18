import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'`;
  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS payment_intent_id TEXT`;
  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS transfer_id TEXT`;
  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ`;

  console.log('Added payments columns to users and sponsorships');
}

main().catch(console.error);
