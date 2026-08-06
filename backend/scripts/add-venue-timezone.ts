import { neon } from '@neondatabase/serverless';
import { lookupVenueTimezone } from '../src/timezone';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_timezone text`;

  const rows = (await sql`
    SELECT id, venue_lat, venue_lng FROM events
    WHERE venue_lat IS NOT NULL AND venue_lng IS NOT NULL AND venue_timezone IS NULL
  `) as { id: string; venue_lat: number; venue_lng: number }[];

  let backfilled = 0;
  for (const row of rows) {
    const tz = lookupVenueTimezone(row.venue_lat, row.venue_lng);
    if (tz) {
      await sql`UPDATE events SET venue_timezone = ${tz} WHERE id = ${row.id}`;
      backfilled += 1;
    }
  }

  console.log(`Backfilled ${backfilled} of ${rows.length} events with a venue timezone`);
}

main().catch(console.error);
