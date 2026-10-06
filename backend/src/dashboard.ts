import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, count, inArray, and, ne, isNull, asc } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const dashboardRouter = new Hono<AppEnv>();

dashboardRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

/**
 * GET /api/dashboard
 * Returns the authenticated host's events with RSVP counts per state.
 */
dashboardRouter.get('/', async (c) => {
  const hostId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });

  const events = await db.query.events.findMany({
    where: eq(schema.events.hostId, hostId),
    orderBy: schema.events.createdAt,
  });

  if (events.length === 0) return c.json({ events: [] });

  const eventIds = events.map((e) => e.id);

  // Fetch RSVP counts for all host events in one query.
  const rsvpCounts = await db
    .select({
      eventId: schema.rsvps.eventId,
      state: schema.rsvps.state,
      total: count(),
    })
    .from(schema.rsvps)
    .where(inArray(schema.rsvps.eventId, eventIds))
    .groupBy(schema.rsvps.eventId, schema.rsvps.state);

  // Build a map: eventId -> { going, interested, waitlisted, cancelled }
  const countsMap = new Map<string, Record<string, number>>();
  for (const row of rsvpCounts) {
    if (!countsMap.has(row.eventId)) {
      countsMap.set(row.eventId, { going: 0, interested: 0, waitlisted: 0, cancelled: 0 });
    }
    countsMap.get(row.eventId)![row.state] = Number(row.total);
  }

  // Guest (web, no-account) RSVPs: confirmed ones count toward the same totals.
  // Pending (unconfirmed) and claimed (now a real rsvps row) guests are excluded.
  // Only the display NAME is exposed — never the guest's email or token.
  const guestRows = await db
    .select({
      eventId: schema.guestRsvps.eventId,
      name: schema.guestRsvps.name,
      state: schema.guestRsvps.state,
    })
    .from(schema.guestRsvps)
    .where(
      and(
        inArray(schema.guestRsvps.eventId, eventIds),
        ne(schema.guestRsvps.state, 'pending'),
        isNull(schema.guestRsvps.claimedUserId),
      ),
    )
    .orderBy(asc(schema.guestRsvps.createdAt));
  const guestsByEvent = new Map<string, { name: string; state: string }[]>();
  for (const g of guestRows) {
    if (!countsMap.has(g.eventId)) {
      countsMap.set(g.eventId, { going: 0, interested: 0, waitlisted: 0, cancelled: 0 });
    }
    const counts = countsMap.get(g.eventId)!;
    counts[g.state] = (counts[g.state] ?? 0) + 1;
    if (g.state === 'going' || g.state === 'waitlisted') {
      const list = guestsByEvent.get(g.eventId) ?? [];
      if (list.length < 200) list.push({ name: g.name, state: g.state });
      guestsByEvent.set(g.eventId, list);
    }
  }

  const eventsWithCounts = events.map((e) => ({
    ...e,
    rsvpCounts: countsMap.get(e.id) ?? { going: 0, interested: 0, waitlisted: 0, cancelled: 0 },
    guestAttendees: guestsByEvent.get(e.id) ?? [],
  }));

  return c.json({ events: eventsWithCounts });
});
