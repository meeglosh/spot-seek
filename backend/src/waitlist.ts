/**
 * Waitlist auto-promotion.
 *
 * Called whenever a `going` spot may have been freed (a going RSVP cancelled /
 * moved to another state, or the host raising capacity). Promotes the
 * earliest-waitlisted user(s) to `going` and sends each a `waitlist_promoted`
 * notification (in-app + branded email, subject to their prefs, via notify()).
 *
 * Ordering field: rsvps.updated_at of the waitlisted row. A row's updated_at
 * is only written when its state changes, so for a waitlisted row it equals
 * the moment the user (re)joined the waitlist; created_at would be wrong for
 * users who cancelled and rejoined, or who moved interested -> waitlisted.
 * created_at / id break ties.
 *
 * Atomicity: one conditional UPDATE picks the row via
 * `FOR UPDATE SKIP LOCKED` and re-checks going < capacity in the same
 * statement. neon-http has no transactions, so concurrent writers that raced
 * the count (e.g. a PATCH-to-going) are caught by a post-write re-count that
 * rolls the promoted row back to `waitlisted` (original updated_at kept so it
 * keeps its place in line).
 */
import { and, count, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { notify } from './notifications';

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Hard ceiling on promotions per call (a capacity jump can free many spots).
const MAX_PROMOTIONS_PER_CALL = 500;

export async function promoteFromWaitlist(
  db: Db,
  resendApiKey: string | undefined,
  eventId: string,
): Promise<string[]> {
  const promoted: string[] = [];

  for (let i = 0; i < MAX_PROMOTIONS_PER_CALL; i++) {
    const res = await db.execute(sql`
      WITH picked AS (
        SELECT r.id, r.updated_at AS old_updated_at, e.capacity AS capacity
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
        WHERE r.event_id = ${eventId}
          AND r.state = 'waitlisted'
          AND r.user_id <> e.host_id
          AND e.status = 'published'
          AND e.capacity IS NOT NULL
          AND (e.starts_at IS NULL OR COALESCE(e.ends_at, e.starts_at) > now())
          AND (SELECT COUNT(*) FROM rsvps g WHERE g.event_id = e.id AND g.state = 'going') < e.capacity
        ORDER BY r.updated_at ASC, r.created_at ASC, r.id ASC
        LIMIT 1
        FOR UPDATE OF r SKIP LOCKED
      )
      UPDATE rsvps SET state = 'going'::rsvp_state, updated_at = now()
      FROM picked
      WHERE rsvps.id = picked.id
      RETURNING rsvps.id AS id, rsvps.user_id AS user_id, picked.old_updated_at AS old_updated_at, picked.capacity AS capacity
    `);
    const row = res.rows?.[0] as
      | { id: string; user_id: string; old_updated_at: string | Date; capacity: number }
      | undefined;
    if (!row) break; // nobody eligible, or no free spot

    // Re-count: a concurrent writer may have taken the spot between the guard
    // and the write. Roll back rather than over-fill.
    const [goingRow] = await db
      .select({ total: count() })
      .from(schema.rsvps)
      .where(and(eq(schema.rsvps.eventId, eventId), eq(schema.rsvps.state, 'going')));
    if (Number(goingRow?.total ?? 0) > Number(row.capacity)) {
      await db
        .update(schema.rsvps)
        .set({ state: 'waitlisted', updatedAt: new Date(row.old_updated_at) })
        .where(eq(schema.rsvps.id, row.id));
      break;
    }

    promoted.push(row.user_id);
  }

  if (promoted.length > 0) {
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (event) {
      await Promise.all(
        promoted.map((userId) =>
          notify(db, resendApiKey, {
            userId,
            type: 'waitlist_promoted',
            title: `You're in! "${event.title}"`,
            body: `A spot opened up — you're now going to "${event.title}".`,
            eventId: event.id,
          }).catch((err) => console.error('[waitlist] promote notify failed:', err)),
        ),
      );
    }
  }

  return promoted;
}
