import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');
  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT follows_unique UNIQUE (follower_id, following_id)
    )
  `;
  console.log('Created follows table');
}

main().catch(console.error);
