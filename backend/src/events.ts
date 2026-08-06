import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
import { parseRRule, generateOccurrences } from './recurrence';
import { notify, fanoutFavoriteNearby } from './notifications';

type AppEnv = { Bindings: Env; Variables: { hostId?: string } };

export const eventsRouter = new Hono<AppEnv>();

// Optional auth — attaches hostId when a session exists.
// GET routes are public; POST/PATCH enforce auth inline.
eventsRouter.use('*', async (c, next) => {
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) c.set('hostId', session.user.id);
  } catch { /* unauthenticated reads are fine */ }
  await next();
});

// POST / — host creates an event.
eventsRouter.post('/', async (c) => {
  const hostId = c.get('hostId');
  if (!hostId) return c.json({ error: 'Unauthorized' }, 401);
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
      recurrenceRule: typeof body.recurrenceRule === 'string' ? body.recurrenceRule : null,
    })
    .returning();

  if (event.status === 'published') {
    await fanoutFavoriteNearby(db, c.env.RESEND_API_KEY, event).catch((err) =>
      console.error('[events] favorite_nearby fanout failed:', err),
    );
  }

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
  if (!callerId) return c.json({ error: 'Unauthorized' }, 401);
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
  if (typeof body.recurrenceRule === 'string') patch.recurrenceRule = body.recurrenceRule;

  if (Object.keys(patch).length === 0) return c.json({ error: 'No editable fields provided' }, 400);

  const [updated] = await db
    .update(schema.events)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.events.id, id))
    .returning();

  const becameCancelled = existing.status !== 'cancelled' && updated.status === 'cancelled';
  const venueChanged =
    patch.venueName !== undefined || patch.venueAddress !== undefined ||
    patch.venueLat !== undefined || patch.venueLng !== undefined
      ? existing.venueName !== updated.venueName ||
        existing.venueAddress !== updated.venueAddress ||
        existing.venueLat !== updated.venueLat ||
        existing.venueLng !== updated.venueLng
      : false;

  if (becameCancelled || venueChanged) {
    await (async () => {
      const rsvps = await db.query.rsvps.findMany({
        where: and(eq(schema.rsvps.eventId, id), inArray(schema.rsvps.state, ['going', 'waitlisted'])),
      });
      const recipients = rsvps.filter((r) => r.userId !== updated.hostId);
      if (recipients.length === 0) return;

      if (becameCancelled) {
        await Promise.all(
          recipients.map((r) =>
            notify(db, c.env.RESEND_API_KEY, {
              userId: r.userId,
              type: 'event_cancelled',
              title: `"${updated.title}" was cancelled`,
              body: `The host cancelled "${updated.title}".`,
              eventId: updated.id,
            }),
          ),
        );
      }
      if (venueChanged) {
        await Promise.all(
          recipients.map((r) =>
            notify(db, c.env.RESEND_API_KEY, {
              userId: r.userId,
              type: 'venue_changed',
              title: `Venue changed for "${updated.title}"`,
              body: `The venue for "${updated.title}" changed to ${updated.venueName ?? 'a new location'}.`,
              eventId: updated.id,
            }),
          ),
        );
      }
    })().catch((err) => console.error('[events] cancel/venue notify failed:', err));
  }

  const becamePublished = existing.status !== 'published' && updated.status === 'published';
  if (becamePublished) {
    await fanoutFavoriteNearby(db, c.env.RESEND_API_KEY, updated).catch((err) =>
      console.error('[events] favorite_nearby fanout failed:', err),
    );
  }

  return c.json({ event: updated });
});

// DELETE /:id — host deletes their own event.
eventsRouter.delete('/:id', async (c) => {
  const hostId = c.get('hostId');
  if (!hostId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const existing = await db.query.events.findFirst({ where: eq(schema.events.id, c.req.param('id')) });
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.hostId !== hostId) return c.json({ error: 'Forbidden' }, 403);

  // rsvps.event_id has no ON DELETE CASCADE (unlike comments/reminders/
  // sponsorships), so deleting an event with RSVPs violates the FK and 500s.
  // Clear them explicitly rather than altering the constraint.
  await db.delete(schema.rsvps).where(eq(schema.rsvps.eventId, c.req.param('id')));
  await db.delete(schema.events).where(eq(schema.events.id, c.req.param('id')));
  return c.json({ deleted: true });
});

// POST /:id/cover — upload a cover image to R2; updates cover_image_url on the event.
eventsRouter.post('/:id/cover', async (c) => {
  const hostId = c.get('hostId');
  if (!hostId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, c.req.param('id')) });
  if (!event) return c.json({ error: 'Not found' }, 404);
  if (event.hostId !== hostId) return c.json({ error: 'Forbidden' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ error: 'image field required' }, 400);

  // Derive the extension defensively: some multipart encoders omit the
  // filename, and a name without a dot would otherwise yield the whole name
  // as the "extension". Fall back to the content type, then to jpg.
  const MIME_EXT: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
  };
  const nameExt = file.name && file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : undefined;
  const ext = nameExt ?? MIME_EXT[file.type?.toLowerCase() ?? ''] ?? 'jpg';
  const key = `events/${c.req.param('id')}/cover.${ext}`;

  await c.env.SPOTSEEK_IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  // Serve through the Worker so we don't need a public R2 domain yet.
  const imageUrl = `/api/images/${key}`;

  const [updated] = await db
    .update(schema.events)
    .set({ coverImageUrl: imageUrl, updatedAt: new Date() })
    .where(eq(schema.events.id, c.req.param('id')))
    .returning();

  return c.json({ event: updated });
});

// GET /:id/occurrences — list upcoming occurrence start times for a recurring event.
eventsRouter.get('/:id/occurrences', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, c.req.param('id')),
  });
  if (!event) return c.json({ error: 'Not found' }, 404);
  if (!event.recurrenceRule) return c.json({ occurrences: [] });
  if (!event.startsAt) return c.json({ error: 'Event has no startsAt' }, 400);

  try {
    const rule = parseRRule(event.recurrenceRule);
    const max = Math.min(parseInt(c.req.query('max') ?? '52', 10), 365);
    const occurrences = generateOccurrences(event.startsAt, rule, max);
    return c.json({ occurrences: occurrences.map((d) => d.toISOString()) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
