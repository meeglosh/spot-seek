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

// GET /api/rsvps/mine — current user's RSVPs with event details.
rsvpsRouter.get('/mine', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });

  const rsvps = await db.query.rsvps.findMany({
    where: eq(schema.rsvps.userId, userId),
    orderBy: schema.rsvps.createdAt,
  });

  // Attach event data for each RSVP in one query.
  const eventIds = [...new Set(rsvps.map((r) => r.eventId))];
  const events =
    eventIds.length > 0
      ? await db.query.events.findMany({
          where: (t, { inArray }) => inArray(t.id, eventIds),
        })
      : [];
  const eventsById = new Map(events.map((e) => [e.id, e]));

  const result = rsvps.map((r) => ({ ...r, event: eventsById.get(r.eventId) ?? null }));
  return c.json({ rsvps: result });
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

  // ON CONFLICT (rather than a NOT EXISTS guard) so a cancelled RSVP can be
  // revived: cancelling leaves the row in place with state='cancelled', and
  // matching on the row's mere existence made cancellation permanent — the
  // user could never rejoin. The DO UPDATE only fires for cancelled rows, so
  // an already-active RSVP still yields zero rows and a 409.
  // The capacity count only counts 'going', so the user's own cancelled row
  // never occupies a slot.
  const rows = await db.execute(sql`
    WITH going_count AS (
      SELECT COUNT(*) AS cnt
      FROM rsvps
      WHERE event_id = ${eventId} AND state = 'going'
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
    ON CONFLICT ON CONSTRAINT rsvps_event_user_unique DO UPDATE
      SET state = EXCLUDED.state, updated_at = now()
      WHERE rsvps.state = 'cancelled'
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
