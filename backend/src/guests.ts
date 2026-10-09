/**
 * Guest (no-account) RSVP data logic. See scripts/add-guest-rsvps.ts for the
 * table and DATA_MODEL.md for the rationale.
 *
 * Capacity rule: an event's "going" total = going rows in `rsvps` + going rows
 * in `guest_rsvps` that have NOT been claimed by an account. A claimed guest
 * row is replaced by a real rsvps row, so nobody is ever counted twice.
 * Pending guests (unconfirmed email) never count.
 */
import { eventPhase } from './eventTime';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { notify } from './notifications';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** SQL expression: going users + going unclaimed guests for one event. */
export function goingTotalSql(eventId: string) {
  return sql`(
    (SELECT COUNT(*) FROM rsvps WHERE event_id = ${eventId} AND state = 'going') +
    (SELECT COUNT(*) FROM guest_rsvps WHERE event_id = ${eventId} AND state = 'going' AND claimed_user_id IS NULL)
  )`;
}

export async function countGoing(db: Db, eventId: string): Promise<number> {
  const res = await db.execute(sql`SELECT ${goingTotalSql(eventId)} AS total`);
  return Number((res.rows?.[0] as { total?: string | number } | undefined)?.total ?? 0);
}

/** eventId -> unclaimed guests going (for batched count queries). */
export async function guestGoingCounts(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: schema.guestRsvps.eventId, state: schema.guestRsvps.state })
    .from(schema.guestRsvps)
    .where(
      and(
        inArray(schema.guestRsvps.eventId, eventIds),
        eq(schema.guestRsvps.state, 'going'),
        sql`${schema.guestRsvps.claimedUserId} IS NULL`,
      ),
    );
  for (const r of rows) out.set(r.eventId, (out.get(r.eventId) ?? 0) + 1);
  return out;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email);
}

export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** RSVPs are open while the party is published and upcoming or live (shared eventPhase rule). */
export function eventIsOpen(event: schema.Event, now = new Date()): boolean {
  if (event.status !== 'published') return false;
  if (event.moderationStatus === 'hidden' || event.moderationStatus === 'removed') return false;
  return eventPhase(event, now) !== 'ended';
}

/**
 * pending -> going | waitlisted, atomically against capacity. Returns the
 * resulting state (the current state if the row was no longer pending).
 */
export async function confirmGuest(
  db: Db,
  resendApiKey: string | undefined,
  event: schema.Event,
  guest: schema.GuestRsvp,
): Promise<schema.GuestRsvpState> {
  if (guest.state !== 'pending') return guest.state;
  const capacity = event.capacity;
  const res = await db.execute(sql`
    UPDATE guest_rsvps
    SET state = CASE
          WHEN ${capacity === null ? sql`TRUE` : sql`${goingTotalSql(event.id)} < ${capacity}`}
            THEN 'going' ELSE 'waitlisted' END,
        updated_at = now()
    WHERE id = ${guest.id} AND state = 'pending'
    RETURNING state
  `);
  const row = res.rows?.[0] as { state: schema.GuestRsvpState } | undefined;
  if (!row) {
    const current = await db.query.guestRsvps.findFirst({ where: eq(schema.guestRsvps.id, guest.id) });
    return current?.state ?? guest.state;
  }
  let state = row.state;

  // neon-http has no transactions: concurrent confirmations can pass the guard
  // on the same snapshot. Re-count and roll this row back if over capacity.
  if (state === 'going' && capacity !== null && (await countGoing(db, event.id)) > capacity) {
    await db
      .update(schema.guestRsvps)
      .set({ state: 'waitlisted', updatedAt: new Date() })
      .where(eq(schema.guestRsvps.id, guest.id));
    state = 'waitlisted';
  }

  await notifyHostOfGuest(db, resendApiKey, event).catch((err) =>
    console.error('[guests] host notify failed:', err),
  );
  return state;
}

async function notifyHostOfGuest(db: Db, resendApiKey: string | undefined, event: schema.Event) {
  const going = await countGoing(db, event.id);
  await notify(db, resendApiKey, {
    userId: event.hostId,
    type: 'rsvp',
    title: `New RSVP on "${event.title}"`,
    body: `Someone joined "${event.title}" from the web. ${going} going.`,
    eventId: event.id,
  });
}

/**
 * Attach a newly signed-up/authenticated user's guest RSVPs (same email) to
 * their account. Creates the real rsvps row FIRST (keeping the guest's
 * created/updated timestamps so a waitlist position survives), then marks the
 * guest row claimed. The brief overlap errs toward over-counting, never
 * over-filling. Returns the number of guest RSVPs claimed.
 */
export async function claimGuestRsvps(db: Db, userId: string, email: string): Promise<number> {
  const normalized = normalizeEmail(email);
  const guests = await db.query.guestRsvps.findMany({
    where: and(
      eq(schema.guestRsvps.email, normalized),
      sql`${schema.guestRsvps.claimedUserId} IS NULL`,
      inArray(schema.guestRsvps.state, ['going', 'waitlisted']),
    ),
  });
  if (guests.length === 0) return 0;

  let claimed = 0;
  for (const g of guests) {
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, g.eventId) });
    if (event && event.hostId !== userId) {
      await db.execute(sql`
        INSERT INTO rsvps (event_id, user_id, state, created_at, updated_at)
        VALUES (${g.eventId}, ${userId}, ${g.state}::rsvp_state, ${g.createdAt.toISOString()}, ${g.updatedAt.toISOString()})
        ON CONFLICT ON CONSTRAINT rsvps_event_user_unique DO NOTHING
      `);
    }
    await db
      .update(schema.guestRsvps)
      .set({ claimedUserId: userId, updatedAt: new Date() })
      .where(and(eq(schema.guestRsvps.id, g.id), sql`${schema.guestRsvps.claimedUserId} IS NULL`));
    claimed += 1;
  }
  return claimed;
}
