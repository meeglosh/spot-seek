/**
 * Post-event reviews: attendees rate the host (required) and venue
 * (optional, only meaningful when the event has a venue) after an event has
 * ended. One review per user per event, editable via upsert.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from './schema';
import type { Event, ReviewRow } from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const reviewsRouter = new Hono<AppEnv>();

// All review routes require auth.
reviewsRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

// ─── helpers ────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function hasVenue(event: Event): boolean {
  return !!(event.venueName && event.venueName.trim() && event.venueAddress && event.venueAddress.trim());
}

function venueKeyFor(event: Event): string | null {
  if (!hasVenue(event)) return null;
  return `${event.venueName!.trim().toLowerCase()}|${event.venueAddress!.trim().toLowerCase()}`;
}

function toApiReview(row: ReviewRow, reviewerName: string | null) {
  return {
    id: row.id,
    eventId: row.eventId,
    reviewerId: row.reviewerId,
    reviewerName,
    hostRating: row.hostRating,
    venueRating: row.venueRating,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function namesById(
  db: ReturnType<typeof drizzle<typeof schema>>,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await db.query.users.findMany({ where: inArray(schema.users.id, userIds) });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

// ─── POST / — create or edit (upsert) a review ────────────────────────────────

reviewsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);

  const eventId = typeof body.eventId === 'string' ? body.eventId : undefined;
  if (!eventId) return c.json({ error: 'eventId is required' }, 400);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return c.json({ error: 'Event not found' }, 400);

  if (event.hostId === userId) return c.json({ error: 'Hosts cannot review their own event' }, 400);

  const rsvp = await db.query.rsvps.findFirst({
    where: and(
      eq(schema.rsvps.eventId, eventId),
      eq(schema.rsvps.userId, userId),
      eq(schema.rsvps.state, 'going'),
    ),
  });
  if (!rsvp) return c.json({ error: 'You must have a going RSVP to review this event' }, 400);

  const now = new Date();
  const ended = event.endsAt ? event.endsAt < now : event.startsAt ? event.startsAt < now : false;
  if (!ended) return c.json({ error: 'This event has not ended yet' }, 400);

  const hostRating = body.hostRating;
  if (typeof hostRating !== 'number' || !Number.isInteger(hostRating) || hostRating < 1 || hostRating > 5) {
    return c.json({ error: 'hostRating must be an integer from 1 to 5' }, 400);
  }

  let venueRating: number | null = null;
  if (body.venueRating !== undefined && body.venueRating !== null) {
    if (
      typeof body.venueRating !== 'number' ||
      !Number.isInteger(body.venueRating) ||
      body.venueRating < 1 ||
      body.venueRating > 5
    ) {
      return c.json({ error: 'venueRating must be an integer from 1 to 5' }, 400);
    }
    // Only meaningful when the event actually has a venue — force null otherwise.
    venueRating = hasVenue(event) ? body.venueRating : null;
  }

  let comment: string | null = null;
  if (typeof body.comment === 'string') {
    const trimmed = body.comment.trim();
    comment = trimmed.length > 0 ? trimmed.slice(0, 1000) : null;
  }

  const venueKey = venueKeyFor(event);

  const [row] = await db
    .insert(schema.reviews)
    .values({
      eventId,
      reviewerId: userId,
      hostId: event.hostId,
      venueKey,
      hostRating,
      venueRating,
      comment,
    })
    .onConflictDoUpdate({
      target: [schema.reviews.eventId, schema.reviews.reviewerId],
      set: { hostRating, venueRating, comment, hostId: event.hostId, venueKey, updatedAt: new Date() },
    })
    .returning();

  const reviewer = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return c.json({ review: toApiReview(row, reviewer?.displayName ?? null) });
});

// ─── GET /event/:eventId — this event's reviews + host/venue aggregates ──────

reviewsRouter.get('/event/:eventId', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const eventId = c.req.param('eventId');

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const eventReviews = await db.query.reviews.findMany({
    where: eq(schema.reviews.eventId, eventId),
    orderBy: desc(schema.reviews.createdAt),
    limit: 20,
  });
  const names = await namesById(db, [...new Set(eventReviews.map((r) => r.reviewerId))]);
  const apiReviews = eventReviews.map((r) => toApiReview(r, names.get(r.reviewerId) ?? null));
  const myReview = apiReviews.find((r) => r.reviewerId === userId) ?? null;

  const [hostAgg] = await db
    .select({ avg: sql<string | null>`avg(${schema.reviews.hostRating})`, count: count() })
    .from(schema.reviews)
    .where(eq(schema.reviews.hostId, event.hostId));
  const hostCount = Number(hostAgg?.count ?? 0);
  const host = hostCount > 0 ? { avg: round1(Number(hostAgg!.avg)), count: hostCount } : null;

  let venue: { avg: number; count: number } | null = null;
  const venueKey = venueKeyFor(event);
  if (venueKey) {
    const [venueAgg] = await db
      .select({
        avg: sql<string | null>`avg(${schema.reviews.venueRating})`,
        count: count(schema.reviews.venueRating),
      })
      .from(schema.reviews)
      .where(eq(schema.reviews.venueKey, venueKey));
    const venueCount = Number(venueAgg?.count ?? 0);
    venue = venueCount > 0 ? { avg: round1(Number(venueAgg!.avg)), count: venueCount } : null;
  }

  return c.json({ myReview, host, venue, reviews: apiReviews });
});

// ─── GET /host/:userId — a host's aggregate rating + recent reviews ──────────

reviewsRouter.get('/host/:userId', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const hostId = c.req.param('userId');

  const [agg] = await db
    .select({ avg: sql<string | null>`avg(${schema.reviews.hostRating})`, count: count() })
    .from(schema.reviews)
    .where(eq(schema.reviews.hostId, hostId));
  const total = Number(agg?.count ?? 0);
  const avg = total > 0 ? round1(Number(agg!.avg)) : 0;

  const recentRows = await db.query.reviews.findMany({
    where: eq(schema.reviews.hostId, hostId),
    orderBy: desc(schema.reviews.createdAt),
    limit: 10,
  });
  const names = await namesById(db, [...new Set(recentRows.map((r) => r.reviewerId))]);
  const recent = recentRows.map((r) => toApiReview(r, names.get(r.reviewerId) ?? null));

  return c.json({ avg, count: total, recent });
});
