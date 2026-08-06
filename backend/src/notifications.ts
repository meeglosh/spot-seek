/**
 * In-app + email notifications (task: notifications system).
 *
 * notify() is the single write path for creating a notification row and
 * (subject to the recipient's prefs) emailing them about it. Every call site
 * elsewhere in the codebase fires this without awaiting the caller's own
 * response — notification failures must never break the primary request.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as schema from './schema';
import type { Event, Notification } from './schema';
import { createAuth } from './auth';
import { sendEmail } from './reminders';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type NotificationType =
  | 'sponsor_bid'
  | 'sponsorship_request'
  | 'sponsorship_accepted'
  | 'sponsorship_rejected'
  | 'rsvp'
  | 'reminder_24h'
  | 'reminder_1h'
  | 'event_cancelled'
  | 'venue_changed'
  | 'favorite_nearby';

const DEFAULT_PREFS = { emailEnabled: true, pushEnabled: false, radiusMiles: 100 };

// ─── Core write path ──────────────────────────────────────────────────────────

export async function notify(
  db: Db,
  resendApiKey: string | undefined,
  args: { userId: string; type: NotificationType; title: string; body: string; eventId?: string },
): Promise<Notification | undefined> {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      eventId: args.eventId ?? null,
    })
    .returning();

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, args.userId) });
  const prefs = await db.query.notificationPrefs.findFirst({
    where: eq(schema.notificationPrefs.userId, args.userId),
  });
  const emailEnabled = prefs?.emailEnabled ?? DEFAULT_PREFS.emailEnabled;

  if (emailEnabled && user?.email) {
    if (resendApiKey) {
      await sendEmail(user.email, args.title, args.body, resendApiKey).catch((err) =>
        console.error('[notifications] email send failed:', err),
      );
    } else {
      console.log(`[DEV NOTIFICATION] to=${user.email} type=${args.type} title="${args.title}"`);
    }
  }

  return row;
}

// ─── Haversine (miles) ────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Favorites-nearby fanout ───────────────────────────────────────────────────
// Fired when an event goes live (created published, or draft -> published).
// Notifies users who favourited the event's broadcast subject, are not the
// host, have a coarse last-known location, and fall within their own
// (or default) radiusMiles of the event's venue.

export async function fanoutFavoriteNearby(
  db: Db,
  resendApiKey: string | undefined,
  event: Event,
): Promise<void> {
  if (event.venueLat == null || event.venueLng == null) return;

  const favourites = await db.query.userFavourites.findMany({
    where: eq(schema.userFavourites.value, event.broadcastSubject),
  });
  if (favourites.length === 0) return;

  const candidateIds = [...new Set(favourites.map((f) => f.userId))].filter((id) => id !== event.hostId);
  if (candidateIds.length === 0) return;

  const users = await db.query.users.findMany({ where: inArray(schema.users.id, candidateIds) });
  const prefsRows = await db.query.notificationPrefs.findMany({
    where: inArray(schema.notificationPrefs.userId, candidateIds),
  });
  const prefsByUser = new Map(prefsRows.map((p) => [p.userId, p]));

  const title = `New ${event.broadcastSubject} party near you`;
  const body = `"${event.title}" was just posted${event.venueName ? ` at ${event.venueName}` : ''} — check it out.`;

  await Promise.all(
    users
      .filter((u) => u.lastLat != null && u.lastLng != null)
      .filter((u) => {
        const radius = prefsByUser.get(u.id)?.radiusMiles ?? DEFAULT_PREFS.radiusMiles;
        const distance = haversineMiles(u.lastLat as number, u.lastLng as number, event.venueLat as number, event.venueLng as number);
        return distance <= radius;
      })
      .map((u) =>
        notify(db, resendApiKey, {
          userId: u.id,
          type: 'favorite_nearby',
          title,
          body,
          eventId: event.id,
        }).catch((err) => console.error('[notifications] favorite_nearby failed:', err)),
      ),
  );
}

// ─── Scheduled reminders (24h / 1h before start) ──────────────────────────────
// Dedupe: skip if a notifications row already exists for the same
// userId+eventId+type, so cron re-runs (and the manual /run-reminders
// endpoint) are idempotent.

async function alreadyNotified(db: Db, userId: string, eventId: string, type: NotificationType): Promise<boolean> {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(schema.notifications.userId, userId),
      eq(schema.notifications.eventId, eventId),
      eq(schema.notifications.type, type),
    ),
  });
  return !!existing;
}

async function fireReminderWindow(
  db: Db,
  resendApiKey: string | undefined,
  windowStart: Date,
  windowEnd: Date,
  type: 'reminder_24h' | 'reminder_1h',
): Promise<number> {
  const events = await db.query.events.findMany({
    where: eq(schema.events.status, 'published'),
  });
  const inWindow = events.filter((e) => e.startsAt && e.startsAt >= windowStart && e.startsAt < windowEnd);
  if (inWindow.length === 0) return 0;

  let sent = 0;
  for (const event of inWindow) {
    const rsvps = await db.query.rsvps.findMany({
      where: and(eq(schema.rsvps.eventId, event.id), inArray(schema.rsvps.state, ['going', 'waitlisted'])),
    });
    const when = type === 'reminder_24h' ? 'is tomorrow' : 'starts soon';
    const title = `"${event.title}" ${when}`;
    const timeStr = event.startsAt ? event.startsAt.toUTCString() : '';
    const body =
      `"${event.title}" starts ${timeStr}.` +
      (event.venueName && !event.isPrivateLocation ? ` Venue: ${event.venueName}.` : '');

    for (const rsvp of rsvps) {
      if (await alreadyNotified(db, rsvp.userId, event.id, type)) continue;
      await notify(db, resendApiKey, { userId: rsvp.userId, type, title, body, eventId: event.id }).catch((err) =>
        console.error(`[notifications] ${type} failed:`, err),
      );
      sent += 1;
    }
  }
  return sent;
}

export async function runReminderSweep(
  databaseUrl: string,
  resendApiKey: string | undefined,
): Promise<{ sent24h: number; sent1h: number }> {
  const db = drizzle(neon(databaseUrl), { schema });
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const MIN15 = 15 * 60 * 1000;

  const sent24h = await fireReminderWindow(
    db,
    resendApiKey,
    new Date(now + 24 * HOUR),
    new Date(now + 24 * HOUR + MIN15),
    'reminder_24h',
  );
  const sent1h = await fireReminderWindow(
    db,
    resendApiKey,
    new Date(now + HOUR),
    new Date(now + HOUR + MIN15),
    'reminder_1h',
  );
  return { sent24h, sent1h };
}

// ─── Scheduled handler (cron) ──────────────────────────────────────────────────

export async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  await runReminderSweep(env.DATABASE_URL, env.RESEND_API_KEY);
}

// ─── Router ────────────────────────────────────────────────────────────────────

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const notificationsRouter = new Hono<AppEnv>();

// All notification routes require auth.
notificationsRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

notificationsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rows = await db.query.notifications.findMany({
    where: eq(schema.notifications.userId, userId),
    orderBy: desc(schema.notifications.createdAt),
    limit: 100,
  });
  const unread = rows.filter((n) => !n.read).length;
  return c.json({ notifications: rows, unread });
});

notificationsRouter.post('/read', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { ids } = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: undefined }));

  if (ids && ids.length > 0) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.id, ids)));
  } else {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.userId, userId));
  }
  return c.json({ ok: true });
});

notificationsRouter.get('/prefs', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const prefs = await db.query.notificationPrefs.findFirst({
    where: eq(schema.notificationPrefs.userId, userId),
  });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return c.json({
    prefs: {
      emailEnabled: prefs?.emailEnabled ?? DEFAULT_PREFS.emailEnabled,
      pushEnabled: prefs?.pushEnabled ?? DEFAULT_PREFS.pushEnabled,
      radiusMiles: prefs?.radiusMiles ?? DEFAULT_PREFS.radiusMiles,
      lastLat: user?.lastLat ?? null,
      lastLng: user?.lastLng ?? null,
    },
  });
});

notificationsRouter.put('/prefs', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const body = await c.req.json<{
    emailEnabled?: boolean; pushEnabled?: boolean; radiusMiles?: number; lat?: number; lng?: number;
  }>();

  const existing = await db.query.notificationPrefs.findFirst({
    where: eq(schema.notificationPrefs.userId, userId),
  });

  const values = {
    emailEnabled: typeof body.emailEnabled === 'boolean' ? body.emailEnabled : (existing?.emailEnabled ?? DEFAULT_PREFS.emailEnabled),
    pushEnabled: typeof body.pushEnabled === 'boolean' ? body.pushEnabled : (existing?.pushEnabled ?? DEFAULT_PREFS.pushEnabled),
    radiusMiles:
      typeof body.radiusMiles === 'number'
        ? Math.min(500, Math.max(10, body.radiusMiles))
        : (existing?.radiusMiles ?? DEFAULT_PREFS.radiusMiles),
  };

  await db
    .insert(schema.notificationPrefs)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.notificationPrefs.userId, set: { ...values, updatedAt: new Date() } });

  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    const lat = Math.round(body.lat * 100) / 100;
    const lng = Math.round(body.lng * 100) / 100;
    await db
      .update(schema.users)
      .set({ lastLat: lat, lastLng: lng, locationUpdatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return c.json({
    prefs: {
      ...values,
      lastLat: user?.lastLat ?? null,
      lastLng: user?.lastLng ?? null,
    },
  });
});

notificationsRouter.post('/run-reminders', async (c) => {
  const result = await runReminderSweep(c.env.DATABASE_URL, c.env.RESEND_API_KEY);
  return c.json(result);
});
