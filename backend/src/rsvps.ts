import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const rsvpsRouter = new Hono<AppEnv>();

// All RSVP routes require authentication.
rsvpsRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

// POST /api/rsvps — attendee RSVPs to an event.
// Enforces capacity (overflow -> waitlisted) and one-rsvp-per-user.
rsvpsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const body = await c.req.json<{ eventId?: string; state?: string }>();

  if (!body.eventId) return c.json({ error: 'eventId is required' }, 400);

  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, body.eventId),
  });
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // Atomic insert: determine state (going vs waitlisted) and check uniqueness
  // in a single CTE to avoid a race condition where concurrent requests all see
  // the same going count before any of them commits.
  const eventId = body.eventId;
  const capacity = event.capacity;

  const rows = await db.execute(sql`
    WITH going_count AS (
      SELECT COUNT(*) AS cnt
      FROM rsvps
      WHERE event_id = ${eventId} AND state = 'going'
    ),
    existing AS (
      SELECT id FROM rsvps WHERE event_id = ${eventId} AND user_id = ${userId}
    )
    INSERT INTO rsvps (event_id, user_id, state)
    SELECT
      ${eventId},
      ${userId},
      CASE
        WHEN ${capacity === null ? sql`TRUE` : sql`(SELECT cnt FROM going_count) < ${capacity}`}
          THEN 'going'::rsvp_state
        ELSE 'waitlisted'::rsvp_state
      END
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    RETURNING *
  `);

  if (!rows.rows || rows.rows.length === 0) {
    return c.json({ error: "Already RSVP'd to this event" }, 409);
  }

  // Map snake_case DB columns to camelCase for API consistency.
  const row = rows.rows[0] as Record<string, unknown>;
  const rsvp = {
    id: row['id'],
    eventId: row['event_id'],
    userId: row['user_id'],
    state: row['state'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };

  return c.json({ rsvp }, 201);
});

// PATCH /api/rsvps/:id — update state (e.g. cancel).
rsvpsRouter.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rsvp = await db.query.rsvps.findFirst({
    where: eq(schema.rsvps.id, c.req.param('id')),
  });
  if (!rsvp) return c.json({ error: 'Not found' }, 404);
  if (rsvp.userId !== userId) return c.json({ error: 'Forbidden' }, 403);

  const { state } = await c.req.json<{ state: schema.RsvpState }>();
  if (!['going', 'interested', 'waitlisted', 'cancelled'].includes(state)) {
    return c.json({ error: 'Invalid state' }, 400);
  }

  const [updated] = await db
    .update(schema.rsvps)
    .set({ state, updatedAt: new Date() })
    .where(eq(schema.rsvps.id, rsvp.id))
    .returning();

  return c.json({ rsvp: updated });
});
