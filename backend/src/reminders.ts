/**
 * Reminder scaffolding (task 1.8, resolved in blocked-resolutions).
 *
 * Provider choices (from BLOCKED.md resolution):
 *   - Email:      Resend (RESEND_API_KEY env secret)
 *   - Push:       Expo Push API (push tokens stored per-device in future)
 *   - Scheduling: Cloudflare Queues (queue binding wired in wrangler.jsonc later)
 *
 * When RESEND_API_KEY is absent the dev/console sender is used as fallback.
 * Real keys must be added via `wrangler secret put RESEND_API_KEY`.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import type { Event, Rsvp } from './schema';
import { createAuth } from './auth';

// ─── Email sender via Resend ──────────────────────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  text: string,
  apiKey: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SpotSeek <reminders@spotseek.app>',
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

// ─── Expo Push sender ─────────────────────────────────────────────────────────
// Push tokens are stored per-device (Phase 2.1). When a user has tokens,
// this function sends via the Expo Push API directly (no SDK required in Workers).
async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: pushToken, title, body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Expo Push error ${res.status}: ${err}`);
  }
}

// ─── Dev / fallback sender ────────────────────────────────────────────────────
function sendReminderDev(rsvp: Rsvp, event: Event): void {
  console.log(
    `[DEV REMINDER] eventId=${event.id} userId=${rsvp.userId} ` +
      `title="${event.title}" state=${rsvp.state}`,
  );
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────
async function sendReminder(
  rsvp: Rsvp,
  event: Event,
  userEmail: string | null,
  resendApiKey: string | undefined,
): Promise<void> {
  const subject = `Reminder: "${event.title}" starts soon`;
  const text =
    `Hi! "${event.title}" (${event.broadcastSubject}) starts in about 1 hour.\n\n` +
    (event.venueName ? `Venue: ${event.venueName}\n` : '') +
    (event.venueAddress && !event.isPrivateLocation ? `Address: ${event.venueAddress}\n` : '');

  if (resendApiKey && userEmail) {
    await sendEmail(userEmail, subject, text, resendApiKey);
    return;
  }

  // Expo push: requires push token stored on the user profile (Phase 2.1).
  // Placeholder — token lookup will be added when user profiles are built.

  sendReminderDev(rsvp, event);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
/**
 * Records the intent to send a reminder T-1h before the event starts.
 * In production: enqueue to Cloudflare Queue (binding added via wrangler.jsonc).
 */
export async function scheduleReminders(
  sql: ReturnType<typeof neon>,
  eventId: string,
): Promise<void> {
  const db = drizzle(sql, { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event?.startsAt) return;

  const reminderAt = new Date(event.startsAt.getTime() - 60 * 60 * 1000);
  console.log(`[REMINDERS] Queued for event ${eventId} at ${reminderAt.toISOString()}`);
  // TODO: ctx.waitUntil(queue.send({ eventId, scheduledFor: reminderAt }))
}

/**
 * Fires reminders to all going RSVPs on the event.
 */
export async function fireReminders(
  sql: ReturnType<typeof neon>,
  eventId: string,
  resendApiKey?: string,
): Promise<{ sent: number }> {
  const db = drizzle(sql, { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return { sent: 0 };

  const rsvps = await db.query.rsvps.findMany({
    where: and(eq(schema.rsvps.eventId, eventId), eq(schema.rsvps.state, 'going')),
  });

  // Fetch user emails for Resend.
  const userIds = rsvps.map((r) => r.userId);
  const users =
    userIds.length > 0
      ? await db.query.users.findMany({
          where: (u, { inArray }) => inArray(u.id, userIds),
        })
      : [];
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  await Promise.all(
    rsvps.map((r) => sendReminder(r, event, emailById.get(r.userId) ?? null, resendApiKey)),
  );

  return { sent: rsvps.length };
}

// ─── Router ───────────────────────────────────────────────────────────────────
type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const remindersRouter = new Hono<AppEnv>();

remindersRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

remindersRouter.post('/send', async (c) => {
  const hostId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { eventId } = await c.req.json<{ eventId?: string }>();

  if (!eventId) return c.json({ error: 'eventId required' }, 400);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return c.json({ error: 'Event not found' }, 404);
  if (event.hostId !== hostId) return c.json({ error: 'Forbidden' }, 403);

  const result = await fireReminders(neon(c.env.DATABASE_URL), eventId, c.env.RESEND_API_KEY);
  const sender = c.env.RESEND_API_KEY ? 'resend' : 'dev-console';
  return c.json({ ...result, sender });
});
