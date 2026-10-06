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
 *     Guest RSVPs (guest_rsvps) with the user's email, or claimed by the user,
 *     are deleted first (privacy); the events where one was 'going' also get
 *     promotion (promoteFromWaitlist considers guests too).
 *  3b. Unfinished payments (requires_payment, as sponsor or on the user's
 *     events): the Stripe PaymentIntent is cancelled, the sponsorship is marked
 *     cancelled and the other party notified. A PI that already succeeded (or
 *     is processing) is 409 money_in_flight. No Stripe key: just mark cancelled.
 *  5. The user's own past/draft/cancelled/completed events are deleted (their
 *     RSVPs are cleared explicitly — rsvps.event_id has no ON DELETE CASCADE —
 *     and everything else hanging off the event cascades), because
 *     events.host_id is ON DELETE RESTRICT by design. EXCEPT events with any
 *     sponsorship carrying payment history (paymentStatus != 'unpaid' or a
 *     paymentIntentId/transferId): those are kept, scrubbed and reassigned to
 *     the anonymous `deleted-host` user; the user's own sponsorships with
 *     payment history are reassigned to `deleted-sponsor` (deleted-users.ts).
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
import { and, eq, inArray, ne, or, isNotNull } from 'drizzle-orm';
import * as schema from './schema';
import * as authSchema from './auth-schema';
import { createAuth } from './auth';
import { promoteFromWaitlist } from './waitlist';
import { normalizeEmail } from './guests';
import { getClient } from './payments';
import { notify } from './notifications';
import { ensureDeletedHost, ensureDeletedSponsor } from './deleted-users';

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
  // Independent reads run concurrently (each is one neon-http round trip).
  const paidQuery = db
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
  const [hosted, paid] = await Promise.all([
    db.select().from(schema.events).where(eq(schema.events.hostId, userId)),
    paidQuery,
  ]);
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

  // ── 3b. Unfinished payments: cancel the PaymentIntent, cancel the sponsorship ─
  // requires_payment rows where the user is the sponsor or the event's host.
  // Stripe first (irreversible), then the row, one at a time, so a later
  // failure/409 leaves every already-cancelled row consistent. A PI that has
  // already succeeded (or is processing) means money is in flight: 409.
  const unfinished = await db
    .select({
      id: schema.sponsorships.id,
      eventId: schema.sponsorships.eventId,
      eventTitle: schema.events.title,
      amountCents: schema.sponsorships.amountCents,
      sponsorId: schema.sponsorships.sponsorId,
      hostId: schema.events.hostId,
      paymentIntentId: schema.sponsorships.paymentIntentId,
    })
    .from(schema.sponsorships)
    .innerJoin(schema.events, eq(schema.events.id, schema.sponsorships.eventId))
    .where(
      and(
        eq(schema.sponsorships.paymentStatus, 'requires_payment'),
        or(eq(schema.sponsorships.sponsorId, userId), eq(schema.events.hostId, userId)),
      ),
    );
  if (unfinished.length > 0) {
    const stripe = getClient(c.env);
    const inFlight: typeof unfinished = [];
    for (const row of unfinished) {
      if (stripe && row.paymentIntentId) {
        let status: string;
        try {
          status = (await stripe.cancelPaymentIntent(row.paymentIntentId)).status;
        } catch (err) {
          console.error('[account] PaymentIntent cancel failed:', err);
          return c.json({ error: 'payment_cancel_failed', sponsorshipId: row.id }, 502);
        }
        if (status !== 'canceled') {
          inFlight.push(row);
          continue;
        }
      }
      await db
        .update(schema.sponsorships)
        .set({ status: 'cancelled', paymentStatus: 'unpaid', updatedAt: new Date() })
        .where(eq(schema.sponsorships.id, row.id));
      const isSponsor = row.sponsorId === userId;
      const otherParty = isSponsor ? row.hostId : row.sponsorId;
      await notify(db, c.env.RESEND_API_KEY, {
        userId: otherParty,
        type: 'sponsorship_rejected',
        title: 'Sponsorship cancelled',
        body: isSponsor
          ? `The sponsor closed their account, so their pending sponsorship of "${row.eventTitle}" was cancelled. No payment was taken.`
          : `The host closed their account, so your sponsorship of "${row.eventTitle}" was cancelled. Your payment was not taken.`,
        eventId: row.eventId,
      }).catch((err) => console.error('[account] cancel notify failed:', err));
    }
    if (inFlight.length > 0) {
      return c.json(
        {
          error: 'money_in_flight',
          sponsorships: inFlight.map((p) => ({
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
  }

  // ── 3c. Payment history must outlive the account ────────────────────────────
  // History = paymentStatus != 'unpaid' OR a paymentIntentId/transferId set.
  // Events (host side) and sponsorship rows (sponsor side) carrying history are
  // KEPT and handed to anonymous placeholder users (deleted-users.ts).
  const hasHistory = or(
    ne(schema.sponsorships.paymentStatus, 'unpaid'),
    isNotNull(schema.sponsorships.paymentIntentId),
    isNotNull(schema.sponsorships.transferId),
  );
  const hostedIdsAll = hosted.map((e) => e.id);
  // Guest RSVPs (web /e/:id RSVPs, guest_rsvps) tied to this person are deleted
  // for privacy: rows with their email (pending/unclaimed or otherwise) and rows
  // claimed by their account (claimed_user_id would otherwise be SET NULL by the
  // FK, leaving a phantom unclaimed 'going' guest that holds a spot and keeps
  // their email). Spots they held are freed, so those events get promotion too.
  const guestWhere = or(
    eq(schema.guestRsvps.email, normalizeEmail(session.user.email)),
    eq(schema.guestRsvps.claimedUserId, userId),
  );
  const [keptRows, sponsorHistory, goingRows, guestGoing] = await Promise.all([
    hostedIdsAll.length > 0
      ? db
          .selectDistinct({ eventId: schema.sponsorships.eventId })
          .from(schema.sponsorships)
          .where(and(inArray(schema.sponsorships.eventId, hostedIdsAll), hasHistory))
      : Promise.resolve([] as { eventId: string }[]),
    db
      .select({ id: schema.sponsorships.id })
      .from(schema.sponsorships)
      .where(and(eq(schema.sponsorships.sponsorId, userId), hasHistory)),
    db
      .select({ eventId: schema.rsvps.eventId })
      .from(schema.rsvps)
      .where(and(eq(schema.rsvps.userId, userId), eq(schema.rsvps.state, 'going'))),
    db
      .select({ eventId: schema.guestRsvps.eventId })
      .from(schema.guestRsvps)
      .where(and(guestWhere, eq(schema.guestRsvps.state, 'going'))),
  ]);
  const keptEventIds = new Set(keptRows.map((r) => r.eventId));

  // Only events WITHOUT payment history are deleted below.
  const hostedIds = hosted.map((e) => e.id).filter((id) => !keptEventIds.has(id));

  // ── 4. Free the user's going spots, then promote the waitlists ──────────────
  // A going RSVP must leave the 'going' state BEFORE promotion runs or the
  // capacity guard still counts it. Events the user hosts are skipped: they are
  // deleted below.
  await db.delete(schema.guestRsvps).where(guestWhere);

  const goingEventIds = [
    ...new Set([...goingRows, ...guestGoing].map((r) => r.eventId)),
  ].filter((id) => !hostedIds.includes(id));
  if (goingEventIds.length > 0) {
    await db
      .update(schema.rsvps)
      .set({ state: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(schema.rsvps.userId, userId),
          eq(schema.rsvps.state, 'going'),
          inArray(schema.rsvps.eventId, goingEventIds),
        ),
      );
    // Events are independent; promote them concurrently.
    await Promise.all(
      goingEventIds.map((eventId) =>
        promoteFromWaitlist(db, c.env.RESEND_API_KEY, eventId).catch((err) =>
          console.error('[account] waitlist promotion failed:', err),
        ),
      ),
    );
  }

  // ── 5. Delete the user's own (non-upcoming) events ──────────────────────────
  if (hostedIds.length > 0) {
    await db.delete(schema.rsvps).where(inArray(schema.rsvps.eventId, hostedIds));
    await db.delete(schema.events).where(inArray(schema.events.id, hostedIds));
  }

  // Kept events (payment history): reassign to the anonymous "Deleted host" and
  // scrub the host's personal content. Status moves out of the public feed /
  // sitemap ('cancelled' stays, everything else becomes 'completed'); none of
  // them is upcoming (checked above) and none has money in flight. Private
  // (home) venues are blanked; the description and cover are the host's own
  // words/photos. Title, time and amounts stay: they are the payment record.
  if (keptEventIds.size > 0) {
    const authDbForPlaceholder = drizzle(sql, { schema: authSchema });
    const placeholderHost = await ensureDeletedHost(db, authDbForPlaceholder);
    for (const e of hosted.filter((h) => keptEventIds.has(h.id))) {
      await db
        .update(schema.events)
        .set({
          hostId: placeholderHost,
          description: null,
          coverImageUrl: null,
          recurrenceRule: null,
          status: e.status === 'cancelled' ? 'cancelled' : 'completed',
          ...(e.isPrivateLocation
            ? { venueName: null, venueAddress: null, venueLat: null, venueLng: null, venueTimezone: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.events.id, e.id));
    }
  }

  // Sponsor side: paid-history sponsorships on other hosts' events are kept,
  // anonymised under the "Deleted sponsor" placeholder (+ anonymised profile).
  if (sponsorHistory.length > 0) {
    const placeholderSponsor = await ensureDeletedSponsor(db, drizzle(sql, { schema: authSchema }));
    await db
      .update(schema.sponsorships)
      .set({ sponsorId: placeholderSponsor, note: null, updatedAt: new Date() })
      .where(inArray(schema.sponsorships.id, sponsorHistory.map((r) => r.id)));
  }

  // ── 6. Per-user rows, then the user itself ──────────────────────────────────
  // None of these depend on each other (each only references users / events
  // that still exist), so they run concurrently; the users row goes last.
  await Promise.all([
    db.delete(schema.reviews).where(
      or(eq(schema.reviews.reviewerId, userId), eq(schema.reviews.hostId, userId)),
    ),
    db.delete(schema.follows).where(
      or(eq(schema.follows.followerId, userId), eq(schema.follows.followingId, userId)),
    ),
    db.delete(schema.userFavourites).where(eq(schema.userFavourites.userId, userId)),
    db.delete(schema.notifications).where(eq(schema.notifications.userId, userId)),
    db.delete(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, userId)),
    db.delete(schema.comments).where(eq(schema.comments.userId, userId)),
    db.delete(schema.rsvps).where(eq(schema.rsvps.userId, userId)),
    // Sponsor offers hang off sponsorships; delete the user's remaining own
    // sponsorships (no payment history — those were reassigned above), which
    // cascades their offers. Then the sponsor profile.
    db
      .delete(schema.sponsorships)
      .where(eq(schema.sponsorships.sponsorId, userId))
      .then(() => db.delete(schema.sponsorProfiles).where(eq(schema.sponsorProfiles.id, userId))),
  ]);
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  // Better Auth rows: verification tokens (value = user id, or identifier =
  // email), then sessions/accounts/user.
  const authDb = drizzle(sql, { schema: authSchema });
  await Promise.all([
    authDb.delete(authSchema.authVerification).where(
      or(
        eq(authSchema.authVerification.value, userId),
        eq(authSchema.authVerification.identifier, session.user.email),
      ),
    ),
    authDb.delete(authSchema.authSession).where(eq(authSchema.authSession.userId, userId)),
    authDb.delete(authSchema.authAccount).where(eq(authSchema.authAccount.userId, userId)),
  ]);
  await authDb.delete(authSchema.authUser).where(eq(authSchema.authUser.id, userId));

  // ── 7. R2 cleanup (best effort; DB deletion already succeeded) ──────────────
  await Promise.all(
    hostedIdsAll.map(async (id) => {
      try {
        const listed = await c.env.SPOTSEEK_IMAGES.list({ prefix: `events/${id}/` });
        if (listed.objects.length > 0) {
          await c.env.SPOTSEEK_IMAGES.delete(listed.objects.map((o) => o.key));
        }
      } catch (err) {
        console.error('[account] R2 cleanup failed:', err);
      }
    }),
  );

  return c.json({ deleted: true });
});
