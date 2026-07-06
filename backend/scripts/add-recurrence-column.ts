import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT`;
  console.log('Added recurrence_rule column');
}

main().catch(console.error);
