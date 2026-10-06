import { neon } from '@neondatabase/serverless';

// ADDITIVE ONLY: one new table + index. Safe to re-run.
// Native APNs device tokens (sent to directly from the Worker, src/apns.ts).
//   environment: 'production' (TestFlight/App Store) | 'sandbox' (Xcode builds)
async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'ios',
      environment TEXT NOT NULL DEFAULT 'production',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT push_tokens_token_unique UNIQUE (token),
      CONSTRAINT push_tokens_environment_check CHECK (environment IN ('production', 'sandbox'))
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id)`;

  console.log('Created push_tokens table');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
