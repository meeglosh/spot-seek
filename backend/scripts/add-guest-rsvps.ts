import { neon } from '@neondatabase/serverless';

// ADDITIVE ONLY: one new table + indexes. Safe to re-run.
// Guest (no-account) RSVPs from the public /e/:id web page.
//   state: pending (email not yet confirmed) | going | waitlisted | cancelled
//   token: unguessable secret in the confirmation / manage / cancel links
//   claimed_user_id: set when the guest later signs up with the same email and
//     the RSVP is attached to the account (a real rsvps row is created; a
//     claimed guest row no longer counts toward capacity -> no double counting)
async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '');

  await sql`
    CREATE TABLE IF NOT EXISTS guest_rsvps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      token TEXT NOT NULL,
      claimed_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT guest_rsvps_event_email_unique UNIQUE (event_id, email),
      CONSTRAINT guest_rsvps_token_unique UNIQUE (token),
      CONSTRAINT guest_rsvps_state_check CHECK (state IN ('pending', 'going', 'waitlisted', 'cancelled'))
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS guest_rsvps_event_state_idx ON guest_rsvps (event_id, state)`;
  await sql`CREATE INDEX IF NOT EXISTS guest_rsvps_email_idx ON guest_rsvps (email) WHERE claimed_user_id IS NULL`;

  console.log('Created guest_rsvps table');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
