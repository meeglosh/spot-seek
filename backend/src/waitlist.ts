/**
 * Waitlist auto-promotion.
 *
 * Called whenever a `going` spot may have been freed (a going RSVP cancelled /
 * moved to another state, or the host raising capacity). Promotes the
 * earliest-waitlisted attendee(s) to `going` and notifies each: users get a
 * `waitlist_promoted` notification (in-app + branded email, subject to their
 * prefs, via notify()); guests get the same "You're in!" branded email directly.
 *
 * Guests: the waitlist is the UNION of waitlisted `rsvps` rows and waitlisted
 * unclaimed `guest_rsvps` rows, ordered together by updated_at. The going
 * total also counts both tables (see guests.ts goingTotalSql).
 *
 * Ordering field: updated_at of the waitlisted row. A row's updated_at is only
 * written when its state changes, so for a waitlisted row it equals the moment
 * the attendee (re)joined the waitlist; created_at would be wrong for users
 * who cancelled and rejoined, or who moved interested -> waitlisted.
 * created_at / id break ties.
 *
 * Atomicity: the earliest candidate is picked, then a conditional UPDATE
 * (still 'waitlisted' AND going total < capacity) promotes it. neon-http has
 * no transactions, so concurrent writers that raced the count are caught by a
 * post-write re-count that rolls the promoted row back to `waitlisted`
 * (original updated_at kept so it keeps its place in line).
 */
import { eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { notify } from './notifications';
import { goingTotalSql, countGoing } from './guests';
import { sendEmail } from './reminders';
import { publicBaseUrl } from './email';

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Hard ceiling on promotions per call (a capacity jump can free many spots).
const MAX_PROMOTIONS_PER_CALL = 500;

export async function promoteFromWaitlist(
  db: Db,
  resendApiKey: string | undefined,
  eventId: string,
): Promise<string[]> {
  const promoted: { kind: 'user' | 'guest'; id: string; ref: string }[] = [];
  let failures = 0;

  for (let i = 0; i < MAX_PROMOTIONS_PER_CALL && failures < 3; i++) {
    const picked = await db.execute(sql`
      SELECT kind, id, ref, old_updated_at, capacity FROM (
        SELECT 'user' AS kind, r.id::text AS id, r.user_id AS ref, r.updated_at AS old_updated_at,
               r.created_at AS created_at, e.capacity AS capacity
        FROM rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.event_id = ${eventId} AND r.state = 'waitlisted' AND r.user_id <> e.host_id
          AND e.status = 'published' AND e.capacity IS NOT NULL
          AND (e.starts_at IS NULL OR COALESCE(e.ends_at, e.starts_at) > now())
        UNION ALL
        SELECT 'guest' AS kind, g.id::text AS id, g.id::text AS ref, g.updated_at AS old_updated_at,
               g.created_at AS created_at, e.capacity AS capacity
        FROM guest_rsvps g JOIN events e ON e.id = g.event_id
        WHERE g.event_id = ${eventId} AND g.state = 'waitlisted' AND g.claimed_user_id IS NULL
          AND e.status = 'published' AND e.capacity IS NOT NULL
          AND (e.starts_at IS NULL OR COALESCE(e.ends_at, e.starts_at) > now())
      ) c
      WHERE ${goingTotalSql(eventId)} < c.capacity
      ORDER BY old_updated_at ASC, created_at ASC, id ASC
      LIMIT 1
    `);
    const cand = picked.rows?.[0] as
      | { kind: 'user' | 'guest'; id: string; ref: string; old_updated_at: string | Date; capacity: number }
      | undefined;
    if (!cand) break; // nobody eligible, or no free spot

    const capacity = Number(cand.capacity);
    const res =
      cand.kind === 'user'
        ? await db.execute(sql`
            UPDATE rsvps SET state = 'going'::rsvp_state, updated_at = now()
            WHERE id = ${cand.id}::uuid AND state = 'waitlisted'
              AND ${goingTotalSql(eventId)} < ${capacity}
            RETURNING id`)
        : await db.execute(sql`
            UPDATE guest_rsvps SET state = 'going', updated_at = now()
            WHERE id = ${cand.id}::uuid AND state = 'waitlisted' AND claimed_user_id IS NULL
              AND ${goingTotalSql(eventId)} < ${capacity}
            RETURNING id`);
    if (!res.rows?.length) {
      failures += 1; // lost a race; re-evaluate
      continue;
    }

    // Re-count: a concurrent writer may have taken the spot between the guard
    // and the write. Roll back rather than over-fill.
    if ((await countGoing(db, eventId)) > capacity) {
      const back = new Date(cand.old_updated_at).toISOString();
      if (cand.kind === 'user') {
        await db.execute(sql`
          UPDATE rsvps SET state = 'waitlisted'::rsvp_state, updated_at = ${back} WHERE id = ${cand.id}::uuid`);
      } else {
        await db.execute(sql`
          UPDATE guest_rsvps SET state = 'waitlisted', updated_at = ${back} WHERE id = ${cand.id}::uuid`);
      }
      break;
    }

    promoted.push({ kind: cand.kind, id: cand.id, ref: cand.ref });
  }

  if (promoted.length > 0) {
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (event) {
      await Promise.all(
        promoted.map((p) =>
          (p.kind === 'user'
            ? notify(db, resendApiKey, {
                userId: p.ref,
                type: 'waitlist_promoted',
                title: `You're in! "${event.title}"`,
                body: `A spot opened up — you're now going to "${event.title}".`,
                eventId: event.id,
              })
            : notifyGuestPromoted(db, resendApiKey, event, p.id)
          ).catch((err) => console.error('[waitlist] promote notify failed:', err)),
        ),
      );
    }
  }

  // User ids for account RSVPs, `guest:<id>` for guest RSVPs.
  return promoted.map((p) => (p.kind === 'user' ? p.ref : `guest:${p.id}`));
}

async function notifyGuestPromoted(
  db: Db,
  resendApiKey: string | undefined,
  event: schema.Event,
  guestId: string,
): Promise<void> {
  const guest = await db.query.guestRsvps.findFirst({ where: eq(schema.guestRsvps.id, guestId) });
  if (!guest) return;
  const title = `You're in! "${event.title}"`;
  const body = `A spot opened up — you're now going to "${event.title}".`;
  if (!resendApiKey) {
    console.log(`[DEV GUEST NOTIFICATION] to=${guest.email} type=waitlist_promoted title="${title}"`);
    return;
  }
  const manage = `${publicBaseUrl()}/rsvp/${event.id}/${guest.token}`;
  await sendEmail(guest.email, title, body, resendApiKey, {
    type: 'waitlist_promoted',
    eventId: event.id,
    ctaUrl: manage,
    ctaLabel: 'VIEW MY SPOT',
    linkUrl: manage,
    linkLabel: 'Manage or cancel my RSVP',
    guest: true,
  });
}
