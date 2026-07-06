import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { hostId: string } };

export const eventsRouter = new Hono<AppEnv>();

// Require auth on all event routes — sets hostId from the session.
eventsRouter.use('*', async (c, next) => {
  const sql = neon(c.env.DATABASE_URL);
  const auth = createAuth(sql);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('hostId', session.user.id);
  await next();
});

// POST / — host creates an event.
eventsRouter.post('/', async (c) => {
  const hostId = c.get('hostId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const body = await c.req.json<Record<string, unknown>>();

  if (typeof body.title !== 'string' || typeof body.broadcastSubject !== 'string') {
    return c.json({ error: 'title and broadcastSubject are required' }, 400);
  }

  const [event] = await db
    .insert(schema.events)
    .values({
      // host_id always comes from the session — never from the request body.
      hostId,
      title: body.title,
      broadcastSubject: body.broadcastSubject,
      description: typeof body.description === 'string' ? body.description : null,
      startsAt: body.startsAt ? new Date(body.startsAt as string) : null,
      endsAt: body.endsAt ? new Date(body.endsAt as string) : null,
      capacity: typeof body.capacity === 'number' ? body.capacity : null,
      status:
        body.status === 'draft' ||
        body.status === 'published' ||
        body.status === 'cancelled' ||
        body.status === 'completed'
          ? body.status
          : 'draft',
      venueName: typeof body.venueName === 'string' ? body.venueName : null,
      venueAddress: typeof body.venueAddress === 'string' ? body.venueAddress : null,
      venueLat: typeof body.venueLat === 'number' ? body.venueLat : null,
      venueLng: typeof body.venueLng === 'number' ? body.venueLng : null,
      isPrivateLocation: body.isPrivateLocation === true,
    })
    .returning();

  return c.json({ event }, 201);
});

// GET /:id — fetch a single event (requires auth).
eventsRouter.get('/:id', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, c.req.param('id')),
  });
  if (!event) return c.json({ error: 'Not found' }, 404);
  return c.json({ event });
});

// PATCH /:id — host edits their own event.
// Venue fields may change freely; host_id is immutable.
eventsRouter.patch('/:id', async (c) => {
  const callerId = c.get('hostId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const id = c.req.param('id');

  const existing = await db.query.events.findFirst({
    where: eq(schema.events.id, id),
  });
  if (!existing) return c.json({ error: 'Not found' }, 404);
  // Authorization: only the host may edit their own event.
  if (existing.hostId !== callerId) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<Record<string, unknown>>();

  // Build the update payload from only whitelisted editable fields.
  // host_id is explicitly excluded — it is never part of an edit.
  const patch: Partial<schema.NewEvent> = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.broadcastSubject === 'string') patch.broadcastSubject = body.broadcastSubject;
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.capacity === 'number') patch.capacity = body.capacity;
  if (
    body.status === 'draft' ||
    body.status === 'published' ||
    body.status === 'cancelled' ||
    body.status === 'completed'
  )
    patch.status = body.status;
  if (typeof body.venueName === 'string') patch.venueName = body.venueName;
  if (typeof body.venueAddress === 'string') patch.venueAddress = body.venueAddress;
  if (typeof body.venueLat === 'number') patch.venueLat = body.venueLat;
  if (typeof body.venueLng === 'number') patch.venueLng = body.venueLng;
  if (typeof body.isPrivateLocation === 'boolean') patch.isPrivateLocation = body.isPrivateLocation;

  if (Object.keys(patch).length === 0) return c.json({ error: 'No editable fields provided' }, 400);

  const [updated] = await db
    .update(schema.events)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.events.id, id))
    .returning();

  return c.json({ event: updated });
});
