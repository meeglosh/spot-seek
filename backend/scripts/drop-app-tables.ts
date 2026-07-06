import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');
  await sql`DROP TABLE IF EXISTS rsvps CASCADE`;
  await sql`DROP TABLE IF EXISTS events CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;
  console.log('Dropped: rsvps, events, users');
}

main().catch(console.error);
