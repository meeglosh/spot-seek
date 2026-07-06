/**
 * Phase 3 — Sponsor accounts (3.1), Sponsored event slots / auction (3.2),
 * Offers/promos (3.3), and Analytics (3.4).
 *
 * Auction mechanic (Google Ads-style):
 *   - Sponsors bid amount_cents on a published event.
 *   - Platform fee = 15% of the winning bid (stored at acceptance time).
 *   - Host reviews bids and accepts the best one; others remain pending.
 *   - Payment processing is stubbed — see BLOCKED.md for Stripe integration.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

const PLATFORM_FEE_RATE = 0.15;

type AppEnv = { Bindings: Env; Variables: { userId?: string } };

export const sponsorsRouter = new Hono<AppEnv>();

// Optional auth: attaches userId when a session is present.
// Individual routes check for userId and return 401 if required but absent.
sponsorsRouter.use('*', async (c, next) => {
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) c.set('userId', session.user.id);
  } catch { /* unauthenticated reads are allowed */ }
  await next();
});

// ── 3.1 Sponsor accounts ──────────────────────────────────────────────────────

sponsorsRouter.post('/register', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { companyName, website } = await c.req.json<{ companyName?: string; website?: string }>();
  if (!companyName?.trim()) return c.json({ error: 'companyName is required' }, 400);

  const [profile] = await db
    .insert(schema.sponsorProfiles)
    .values({ id: userId, companyName: companyName.trim(), website: website ?? null })
    .onConflictDoUpdate({
      target: schema.sponsorProfiles.id,
      set: { companyName: companyName.trim(), website: website ?? null, updatedAt: new Date() },
    })
    .returning();
  return c.json({ sponsor: profile }, 201);
});

sponsorsRouter.get('/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const profile = await db.query.sponsorProfiles.findFirst({
    where: eq(schema.sponsorProfiles.id, userId),
  });
  if (!profile) return c.json({ error: 'Not a sponsor' }, 404);
  return c.json({ sponsor: profile });
});

// Public — no auth required.
sponsorsRouter.get('/:id', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const profile = await db.query.sponsorProfiles.findFirst({
    where: eq(schema.sponsorProfiles.id, c.req.param('id')),
  });
  if (!profile) return c.json({ error: 'Not found' }, 404);
  return c.json({ sponsor: profile });
});

// ── 3.2 Sponsored event slots / auction ───────────────────────────────────────

sponsorsRouter.post('/bids', async (c) => {
  const sponsorId = c.get('userId');
  if (!sponsorId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const profile = await db.query.sponsorProfiles.findFirst({
    where: eq(schema.sponsorProfiles.id, sponsorId),
  });
  if (!profile) return c.json({ error: 'Register as a sponsor first' }, 403);

  const { eventId, amountCents, note } = await c.req.json<{
    eventId?: string; amountCents?: number; note?: string;
  }>();
  if (!eventId || typeof amountCents !== 'number' || amountCents <= 0) {
    return c.json({ error: 'eventId and amountCents (>0) are required' }, 400);
  }

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event || event.status !== 'published') return c.json({ error: 'Event not found or not published' }, 404);

  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  const [bid] = await db
    .insert(schema.sponsorships)
    .values({ eventId, sponsorId, amountCents, platformFeeCents, note: note ?? null })
    .returning();
  return c.json({ bid }, 201);
});

sponsorsRouter.get('/bids/mine', async (c) => {
  const sponsorId = c.get('userId');
  if (!sponsorId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const bids = await db.query.sponsorships.findMany({
    where: eq(schema.sponsorships.sponsorId, sponsorId),
    orderBy: desc(schema.sponsorships.createdAt),
  });
  return c.json({ bids });
});

sponsorsRouter.get('/events/:eventId/bids', async (c) => {
  const hostId = c.get('userId');
  if (!hostId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, c.req.param('eventId')) });
  if (!event) return c.json({ error: 'Not found' }, 404);
  if (event.hostId !== hostId) return c.json({ error: 'Forbidden' }, 403);

  const bids = await db.query.sponsorships.findMany({
    where: eq(schema.sponsorships.eventId, c.req.param('eventId')),
    orderBy: desc(schema.sponsorships.amountCents),
  });
  return c.json({ bids });
});

sponsorsRouter.patch('/bids/:id', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const bid = await db.query.sponsorships.findFirst({
    where: eq(schema.sponsorships.id, c.req.param('id')),
  });
  if (!bid) return c.json({ error: 'Not found' }, 404);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, bid.eventId) });
  const isHost = event?.hostId === userId;
  const isSponsor = bid.sponsorId === userId;
  if (!isHost && !isSponsor) return c.json({ error: 'Forbidden' }, 403);

  const { status } = await c.req.json<{ status: schema.SponsorshipStatus }>();
  if (isHost && !['active', 'rejected'].includes(status))
    return c.json({ error: 'Host may set status to active or rejected' }, 400);
  if (isSponsor && status !== 'cancelled')
    return c.json({ error: 'Sponsor may only cancel their bid' }, 400);

  // Stub: payment processing on 'active' → see BLOCKED.md (Stripe).
  const [updated] = await db
    .update(schema.sponsorships)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.sponsorships.id, bid.id))
    .returning();
  return c.json({ bid: updated });
});

// ── 3.3 Offers / promos ───────────────────────────────────────────────────────

sponsorsRouter.post('/bids/:id/offers', async (c) => {
  const sponsorId = c.get('userId');
  if (!sponsorId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const bid = await db.query.sponsorships.findFirst({
    where: and(
      eq(schema.sponsorships.id, c.req.param('id')),
      eq(schema.sponsorships.sponsorId, sponsorId),
    ),
  });
  if (!bid) return c.json({ error: 'Bid not found or not yours' }, 404);
  if (bid.status !== 'active') return c.json({ error: 'Can only add offers to active sponsorships' }, 400);

  const { description, promoCode, discountCents } = await c.req.json<{
    description?: string; promoCode?: string; discountCents?: number;
  }>();
  if (!description?.trim()) return c.json({ error: 'description is required' }, 400);

  const [offer] = await db
    .insert(schema.sponsorOffers)
    .values({
      sponsorshipId: bid.id,
      eventId: bid.eventId,
      description: description.trim(),
      promoCode: promoCode ?? null,
      discountCents: typeof discountCents === 'number' ? discountCents : null,
    })
    .returning();
  return c.json({ offer }, 201);
});

// Public — attendees browse promos for an event without auth.
sponsorsRouter.get('/events/:eventId/offers', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const offers = await db.query.sponsorOffers.findMany({
    where: eq(schema.sponsorOffers.eventId, c.req.param('eventId')),
  });
  return c.json({ offers });
});

// ── 3.4 Analytics ─────────────────────────────────────────────────────────────

sponsorsRouter.get('/analytics/host', async (c) => {
  const hostId = c.get('userId');
  if (!hostId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const events = await db.query.events.findMany({ where: eq(schema.events.hostId, hostId) });
  if (events.length === 0) return c.json({ events: [] });

  const eventIds = events.map((e) => e.id);
  const allBids = await db.query.sponsorships.findMany({
    where: (t, { inArray }) => inArray(t.eventId, eventIds),
  });
  const activeBids = allBids.filter((b) => b.status === 'active');

  const rsvpRows = await db
    .select({ eventId: schema.rsvps.eventId, total: count() })
    .from(schema.rsvps)
    .where(eq(schema.rsvps.state, 'going'))
    .groupBy(schema.rsvps.eventId);
  const rsvpMap = new Map(rsvpRows.map((r) => [r.eventId, Number(r.total)]));

  const result = events.map((e) => {
    const ebids = activeBids.filter((b) => b.eventId === e.id);
    return {
      ...e,
      confirmedAttendees: rsvpMap.get(e.id) ?? 0,
      sponsorRevenueCents: ebids.reduce((acc, b) => acc + b.amountCents - b.platformFeeCents, 0),
      platformRevenueCents: ebids.reduce((acc, b) => acc + b.platformFeeCents, 0),
      activeSponsorships: ebids.length,
    };
  });
  return c.json({ events: result });
});

sponsorsRouter.get('/analytics/me', async (c) => {
  const sponsorId = c.get('userId');
  if (!sponsorId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const bids = await db.query.sponsorships.findMany({
    where: eq(schema.sponsorships.sponsorId, sponsorId),
    orderBy: desc(schema.sponsorships.createdAt),
  });

  const activeBids = bids.filter((b) => b.status === 'active');
  const totalSpendCents = activeBids.reduce((acc, b) => acc + b.amountCents, 0);
  const totalFeeCents = activeBids.reduce((acc, b) => acc + b.platformFeeCents, 0);

  const activeEventIds = [...new Set(activeBids.map((b) => b.eventId))];
  let totalReach = 0;
  if (activeEventIds.length > 0) {
    const [row] = await db
      .select({ total: count() })
      .from(schema.rsvps)
      .where(and(eq(schema.rsvps.state, 'going'), inArray(schema.rsvps.eventId, activeEventIds)));
    totalReach = Number(row?.total ?? 0);
  }

  return c.json({
    bids,
    summary: { totalBids: bids.length, activeBids: activeBids.length, totalSpendCents, totalFeeCents, totalReach },
  });
});
