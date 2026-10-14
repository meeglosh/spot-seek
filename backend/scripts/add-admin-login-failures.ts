// Additive migration: failed admin sign-in log (+ alert dedupe), used by
// src/moderation/admin-login-failures.ts. Safe to re-run. Dev DB only.
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');
  await sql`
    CREATE TABLE IF NOT EXISTS admin_login_failures (
      id SERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS admin_login_failures_created_idx ON admin_login_failures (created_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_login_alerts (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log('Created admin_login_failures, admin_login_alerts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
