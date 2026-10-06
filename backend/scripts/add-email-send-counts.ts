// Additive migration: per-UTC-day counter of real emails sent (Resend quota guard,
// src/email-guard.ts). Safe to re-run. Run against the Neon `dev` branch only.
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    CREATE TABLE IF NOT EXISTS email_send_counts (
      day DATE PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    )
  `;

  console.log('Created email_send_counts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
