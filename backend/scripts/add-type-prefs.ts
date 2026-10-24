import { neon } from '@neondatabase/serverless';

// ADDITIVE ONLY: one new column with a default. Idempotent, safe to re-run.
// Per-type notification switches: { [group]: { push?: boolean, email?: boolean } }.
// A missing key means ON (see src/notification-prefs.ts), so existing rows need no backfill.
async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS type_prefs jsonb NOT NULL DEFAULT '{}'::jsonb`;

  console.log('Ensured notification_prefs.type_prefs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
