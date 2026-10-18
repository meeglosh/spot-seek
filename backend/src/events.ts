import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, inArray, desc } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
import { parseRRule, generateOccurrences } from './recurrence';
import { notify, fanoutFavoriteNearby } from './notifications';
import { lookupVenueTimezone } from './timezone';
import { promoteFromWaitlist } from './waitlist';
import { screenEventContent, logModeration, isPublishingPaused, REJECT_MESSAGE } from './moderation/screen';
import { canViewEvent, isModerationHidden } from './moderation/visibility';
import { isAdminAuthorized } from './admin';
import { maskPrivateLocation } from './feed';

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

  const venueLat = typeof body.venueLat === 'number' ? body.venueLat : null;
  const venueLng = typeof body.venueLng === 'number' ? body.venueLng : null;

  // Moderation gate: only when the event is being published. Drafts always
  // save; publishing is screened again when the draft is published.
  let flaggedCategories: string[] | null = null;
  if (body.status === 'published') {
    if (await isPublishingPaused(db, hostId)) return c.json({ error: 'publishing_paused' }, 403);
    const screen = await screenEventContent(c.env, {
      title: body.title,
      broadcastSubject: body.broadcastSubject,
      description: typeof body.description === 'string' ? body.description : null,
      venueName: typeof body.venueName === 'string' ? body.venueName : null,
      venueAddress: typeof body.venueAddress === 'string' ? body.venueAddress : null,
    });
    if (screen.verdict === 'reject') {
      await logModeration(db, {
        eventId: null,
        action: 'blocked_on_publish',
        reason: screen.source,
        actor: 'system',
        detail: { hostId, stage: 'create', title: body.title.slice(0, 120), match: screen.detail },
      });
      return c.json({ error: 'content_rejected', message: REJECT_MESSAGE }, 422);
    }
    if (screen.verdict === 'flag') flaggedCategories = screen.categories;
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
      venueLat,
      venueLng,
      venueTimezone: lookupVenueTimezone(venueLat, venueLng),
      isPrivateLocation: body.isPrivateLocation === true,
      recurrenceRule: typeof body.recurrenceRule === 'string' ? body.recurrenceRule : null,
      moderationStatus: flaggedCategories ? 'flagged' : 'ok',
    })
    .returning();

  if (flaggedCategories) {
    await logModeration(db, {
      eventId: event.id,
      action: 'auto_flagged',
      reason: 'classifier',
      actor: 'system',
      detail: { categories: flaggedCategories, hostId, stage: 'create' },
    });
  }

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
  // Drafts and hidden/removed events 404 for everyone but the host (and admin).
  // Cancelled/completed stay visible so attendees can see that it was called off.
  if (!canViewEvent(event, c.get('hostId')) && !(await isAdminAuthorized(c.env, c.req.header('Authorization')))) {
    return c.json({ error: 'Not found' }, 404);
  }

  // Active sponsors for this event, highest bid first.
  const sponsorRows = await db
    .select({ companyName: schema.sponsorProfiles.companyName })
    .from(schema.sponsorships)
    .innerJoin(schema.sponsorProfiles, eq(schema.sponsorProfiles.id, schema.sponsorships.sponsorId))
    .where(and(eq(schema.sponsorships.eventId, event.id), eq(schema.sponsorships.status, 'active')))
    .orderBy(desc(schema.sponsorships.amountCents));

  // Same rule as the feed: private-location address/coords are shown only to
  // going/waitlisted attendees. The host also sees them (the edit form loads them here).
  const callerId = c.get('hostId');
  let revealed = !!callerId && callerId === event.hostId;
  if (!revealed && callerId && event.isPrivateLocation) {
    const [rsvp] = await db
      .select({ id: schema.rsvps.id })
      .from(schema.rsvps)
      .where(
        and(
          eq(schema.rsvps.eventId, event.id),
          eq(schema.rsvps.userId, callerId),
          inArray(schema.rsvps.state, ['going', 'waitlisted']),
        ),
      )
      .limit(1);
    revealed = !!rsvp;
  }

  return c.json({ event: { ...maskPrivateLocation(event, revealed), sponsors: sponsorRows } });
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
  // An event an admin took down cannot be edited or republished by the host.
  if (existing.moderationStatus === 'removed') return c.json({ error: 'event_removed' }, 403);

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
  // Venue coords may be set (number), or explicitly cleared (null) — either
  // way venueTimezone is recomputed/cleared alongside them. A missing key
  // means "not part of this patch" and is left untouched.
  if (typeof body.venueLat === 'number' || body.venueLat === null) patch.venueLat = body.venueLat;
  if (typeof body.venueLng === 'number' || body.venueLng === null) patch.venueLng = body.venueLng;
  if ('venueLat' in patch || 'venueLng' in patch) {
    const nextLat = 'venueLat' in patch ? patch.venueLat : existing.venueLat;
    const nextLng = 'venueLng' in patch ? patch.venueLng : existing.venueLng;
    patch.venueTimezone = lookupVenueTimezone(nextLat, nextLng);
  }
  if (typeof body.isPrivateLocation === 'boolean') patch.isPrivateLocation = body.isPrivateLocation;
  if (typeof body.recurrenceRule === 'string') patch.recurrenceRule = body.recurrenceRule;

  if (Object.keys(patch).length === 0) return c.json({ error: 'No editable fields provided' }, 400);

  // Moderation gate: runs when the result is a published event and either it is
  // being published now or a screened field (title/description/venue/subject) changed.
  let flaggedCategories: string[] | null = null;
  const nextStatus = patch.status ?? existing.status;
  const publishingNow = existing.status !== 'published' && nextStatus === 'published';
  const screenedChanged =
    patch.title !== undefined || patch.description !== undefined || patch.broadcastSubject !== undefined ||
    patch.venueName !== undefined || patch.venueAddress !== undefined;
  if (nextStatus === 'published' && (publishingNow || screenedChanged)) {
    if (publishingNow && (await isPublishingPaused(db, callerId))) {
      return c.json({ error: 'publishing_paused' }, 403);
    }
    const merged = {
      title: patch.title ?? existing.title,
      broadcastSubject: patch.broadcastSubject ?? existing.broadcastSubject,
      description: patch.description ?? existing.description,
      venueName: patch.venueName ?? existing.venueName,
      venueAddress: patch.venueAddress ?? existing.venueAddress,
    };
    const screen = await screenEventContent(c.env, merged);
    if (screen.verdict === 'reject') {
      await logModeration(db, {
        eventId: id,
        action: 'blocked_on_publish',
        reason: screen.source,
        actor: 'system',
        detail: { hostId: callerId, stage: 'update', match: screen.detail },
      });
      return c.json({ error: 'content_rejected', message: REJECT_MESSAGE }, 422);
    }
    if (screen.verdict === 'flag') flaggedCategories = screen.categories;
  }
  if (flaggedCategories && existing.moderationStatus === 'ok') patch.moderationStatus = 'flagged';

  const [updated] = await db
    .update(schema.events)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.events.id, id))
    .returning();

  if (patch.moderationStatus === 'flagged') {
    await logModeration(db, {
      eventId: id,
      action: 'auto_flagged',
      reason: 'classifier',
      actor: 'system',
      detail: { categories: flaggedCategories, hostId: callerId, stage: 'update' },
    });
  }

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
              body: `The host called this one off.`,
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
              body: updated.venueName ? `New venue: ${updated.venueName}.` : 'The host changed the venue. Check the party page for details.',
              eventId: updated.id,
            }),
          ),
        );
      }
    })().catch((err) => console.error('[events] cancel/venue notify failed:', err));
  }

  // Capacity raised: promote as many waitlisted users as the new capacity allows.
  if (typeof patch.capacity === 'number' && (existing.capacity === null || patch.capacity > existing.capacity)) {
    await promoteFromWaitlist(db, c.env.RESEND_API_KEY, id).catch((err) =>
      console.error('[events] waitlist promotion failed:', err),
    );
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

  // Raster allowlist only (never SVG/HTML): the bytes must match the magic
  // number of an allowed type, and any declared type must agree. The stored
  // Content-Type and key extension come from the sniffed type, never the client.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  let kind: { type: string; ext: string } | null = null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) kind = { type: 'image/jpeg', ext: 'jpg' };
  else if (head[0] === 0x89 && ascii(1, 4) === 'PNG') kind = { type: 'image/png', ext: 'png' };
  else if (ascii(0, 4) === 'GIF8') kind = { type: 'image/gif', ext: 'gif' };
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') kind = { type: 'image/webp', ext: 'webp' };
  else if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(8, 12))) {
    kind = { type: 'image/heic', ext: 'heic' };
  }
  if (!kind) return c.json({ error: 'Unsupported image type' }, 415);
  const declared = (file.type ?? '').toLowerCase().replace('image/jpg', 'image/jpeg').replace('image/heif', 'image/heic');
  if (declared && declared !== 'application/octet-stream' && declared !== kind.type) {
    return c.json({ error: 'Unsupported image type' }, 415);
  }
  const key = `events/${c.req.param('id')}/cover.${kind.ext}`;

  await c.env.SPOTSEEK_IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: kind.type },
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
  if (!event || (isModerationHidden(event) && event.hostId !== c.get('hostId'))) return c.json({ error: 'Not found' }, 404);
  if (!event.recurrenceRule) return c.json({ occurrences: [] });
  if (!event.startsAt) return c.json({ error: 'Event has no startsAt' }, 400);

  try {
    const rule = parseRRule(event.recurrenceRule);
    // Non-numeric / negative / non-integer input falls back to the default cap.
    const maxParam = c.req.query('max') ?? '';
    const parsedMax = /^\d+$/.test(maxParam) ? parseInt(maxParam, 10) : 52;
    const max = Math.min(parsedMax < 1 ? 52 : parsedMax, 365);
    const occurrences = generateOccurrences(event.startsAt, rule, max);
    return c.json({ occurrences: occurrences.map((d) => d.toISOString()) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
