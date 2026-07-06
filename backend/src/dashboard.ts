import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, count, inArray } from 'drizzle-orm';
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

  const eventsWithCounts = events.map((e) => ({
    ...e,
    rsvpCounts: countsMap.get(e.id) ?? { going: 0, interested: 0, waitlisted: 0, cancelled: 0 },
  }));

  return c.json({ events: eventsWithCounts });
});
