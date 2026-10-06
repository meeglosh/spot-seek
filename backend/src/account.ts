/**
 * Account deletion — DELETE /api/account (App Store requirement: in-app
 * account deletion). Product rules, in order:
 *
 *  1. Body must be { confirm: "DELETE" }.
 *  2. 409 has_upcoming_events: the user hosts a published event that has not
 *     ended. They must cancel it first (cancelling notifies attendees and
 *     refunds sponsors through the existing flows).
 *  3. 409 money_in_flight: any sponsorship with paymentStatus 'paid' (not yet
 *     released/refunded) where the user is the sponsor OR the host of the event.
 *  4. Attendee RSVPs: 'going' RSVPs are moved to 'cancelled' and
 *     promoteFromWaitlist runs for each event so freed spots are filled.
 *  5. The user's own past/draft/cancelled/completed events are deleted (their
 *     RSVPs are cleared explicitly — rsvps.event_id has no ON DELETE CASCADE —
 *     and everything else hanging off the event cascades), because
 *     events.host_id is ON DELETE RESTRICT by design.
 *  6. Per-user rows are deleted explicitly (belt and braces over the FK
 *     cascades), then the app `users` row and the Better Auth user (which
 *     cascades sessions + accounts) are removed. Better Auth's own deleteUser
 *     API is NOT used: enabling it is an auth config change (CLAUDE.md).
 *  7. R2 cover images of the deleted events are removed.
 *
 * The Stripe connected account is deliberately NOT deleted (money/compliance);
 * only our reference (users.stripe_account_id) goes with the user row.
 *
 * neon-http has no transactions, so steps are ordered so that every blocking
 * check happens before anything is destroyed, and a partial failure leaves a
 * still-deletable account the user can retry.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, inArray, or } from 'drizzle-orm';
import * as schema from './schema';
import * as authSchema from './auth-schema';
import { createAuth } from './auth';
import { promoteFromWaitlist } from './waitlist';

type AppEnv = { Bindings: Env };

export const accountRouter = new Hono<AppEnv>();

/** A published event that has not ended yet (mirrors waitlist.ts "upcoming"). */
export function isUpcoming(
  e: { status: string; startsAt: Date | null; endsAt: Date | null },
  now = Date.now(),
): boolean {
  if (e.status !== 'published') return false;
  const end = e.endsAt ?? e.startsAt;
  return end === null || end.getTime() > now;
}

accountRouter.delete('/', async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const auth = createAuth(sql);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = session.user.id;

  let body: { confirm?: unknown } = {};
  try {
    body = await c.req.json();
  } catch { /* handled below */ }
  if (body?.confirm !== 'DELETE') return c.json({ error: 'confirmation_required' }, 400);

  const db = drizzle(sql, { schema });

  // ── 2. Upcoming published events block deletion ─────────────────────────────
  const hosted = await db.select().from(schema.events).where(eq(schema.events.hostId, userId));
  const upcoming = hosted.filter((e) => isUpcoming(e));
  if (upcoming.length > 0) {
    return c.json(
      {
        error: 'has_upcoming_events',
        events: upcoming.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt })),
      },
      409,
    );
  }

  // ── 3. Money in flight blocks deletion ──────────────────────────────────────
  const paid = await db
    .select({
      id: schema.sponsorships.id,
      eventId: schema.sponsorships.eventId,
      eventTitle: schema.events.title,
      amountCents: schema.sponsorships.amountCents,
      sponsorId: schema.sponsorships.sponsorId,
    })
    .from(schema.sponsorships)
    .innerJoin(schema.events, eq(schema.events.id, schema.sponsorships.eventId))
    .where(
      and(
        eq(schema.sponsorships.paymentStatus, 'paid'),
        or(eq(schema.sponsorships.sponsorId, userId), eq(schema.events.hostId, userId)),
      ),
    );
  if (paid.length > 0) {
    return c.json(
      {
        error: 'money_in_flight',
        sponsorships: paid.map((p) => ({
          id: p.id,
          eventId: p.eventId,
          eventTitle: p.eventTitle,
          amountCents: p.amountCents,
          role: p.sponsorId === userId ? 'sponsor' : 'host',
        })),
      },
      409,
    );
  }

  const hostedIds = hosted.map((e) => e.id);

  // ── 4. Free the user's going spots, then promote the waitlists ──────────────
  // A going RSVP must leave the 'going' state BEFORE promotion runs or the
  // capacity guard still counts it. Events the user hosts are skipped: they are
  // deleted below.
  const goingRows = await db
    .select({ eventId: schema.rsvps.eventId })
    .from(schema.rsvps)
    .where(and(eq(schema.rsvps.userId, userId), eq(schema.rsvps.state, 'going')));
  const goingEventIds = goingRows.map((r) => r.eventId).filter((id) => !hostedIds.includes(id));
  if (goingEventIds.length > 0) {
    await db
      .update(schema.rsvps)
      .set({ state: 'cancelled', updatedAt: new Date() })
      .where(and(eq(schema.rsvps.userId, userId), inArray(schema.rsvps.eventId, goingEventIds)));
    for (const eventId of goingEventIds) {
      await promoteFromWaitlist(db, c.env.RESEND_API_KEY, eventId).catch((err) =>
        console.error('[account] waitlist promotion failed:', err),
      );
    }
  }

  // ── 5. Delete the user's own (non-upcoming) events ──────────────────────────
  if (hostedIds.length > 0) {
    await db.delete(schema.rsvps).where(inArray(schema.rsvps.eventId, hostedIds));
    await db.delete(schema.events).where(inArray(schema.events.id, hostedIds));
  }

  // ── 6. Per-user rows, then the user itself ──────────────────────────────────
  await db.delete(schema.reviews).where(
    or(eq(schema.reviews.reviewerId, userId), eq(schema.reviews.hostId, userId)),
  );
  await db.delete(schema.follows).where(
    or(eq(schema.follows.followerId, userId), eq(schema.follows.followingId, userId)),
  );
  await db.delete(schema.userFavourites).where(eq(schema.userFavourites.userId, userId));
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
  await db.delete(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, userId));
  await db.delete(schema.comments).where(eq(schema.comments.userId, userId));
  // Sponsor offers hang off sponsorships; delete the user's own sponsorships
  // (pending/active/etc. — none are paid, checked above) which cascades offers.
  await db.delete(schema.sponsorships).where(eq(schema.sponsorships.sponsorId, userId));
  await db.delete(schema.sponsorProfiles).where(eq(schema.sponsorProfiles.id, userId));
  await db.delete(schema.rsvps).where(eq(schema.rsvps.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  // Better Auth rows: verification tokens (value = user id, or identifier =
  // email), then sessions/accounts/user.
  const authDb = drizzle(sql, { schema: authSchema });
  await authDb.delete(authSchema.authVerification).where(
    or(
      eq(authSchema.authVerification.value, userId),
      eq(authSchema.authVerification.identifier, session.user.email),
    ),
  );
  await authDb.delete(authSchema.authSession).where(eq(authSchema.authSession.userId, userId));
  await authDb.delete(authSchema.authAccount).where(eq(authSchema.authAccount.userId, userId));
  await authDb.delete(authSchema.authUser).where(eq(authSchema.authUser.id, userId));

  // ── 7. R2 cleanup (best effort; DB deletion already succeeded) ──────────────
  for (const id of hostedIds) {
    try {
      const listed = await c.env.SPOTSEEK_IMAGES.list({ prefix: `events/${id}/` });
      if (listed.objects.length > 0) {
        await c.env.SPOTSEEK_IMAGES.delete(listed.objects.map((o) => o.key));
      }
    } catch (err) {
      console.error('[account] R2 cleanup failed:', err);
    }
  }

  return c.json({ deleted: true });
});
