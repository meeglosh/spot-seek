/**
 * Applies the cascade/restrict decisions from BLOCKED.md:
 *   - events.host_id: RESTRICT (can't delete user while they own events)
 *   - rsvps.user_id:  CASCADE  (delete user -> delete their RSVPs)
 *
 * Run: DATABASE_URL_UNPOOLED=... npx tsx scripts/migrate-cascade.ts
 */
import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  // events.host_id: drop old FK, add with RESTRICT.
  await sql`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_host_id_users_id_fk`;
  await sql`ALTER TABLE events ADD CONSTRAINT events_host_id_users_id_fk
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE RESTRICT`;

  // rsvps.user_id: drop old FK, add with CASCADE.
  await sql`ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_user_id_users_id_fk`;
  await sql`ALTER TABLE rsvps ADD CONSTRAINT rsvps_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`;

  console.log('Applied cascade/restrict constraints');
}

main().catch(console.error);
