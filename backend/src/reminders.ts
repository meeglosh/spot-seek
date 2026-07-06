/**
 * Reminder scaffolding (task 1.8).
 *
 * Architecture:
 *   - scheduleReminders(eventId) is called when an event is published.
 *   - sendReminder(rsvp, event) is the send abstraction — dev mode logs to console;
 *     a real provider is BLOCKED.md until credentials are provided.
 *   - The Worker exposes POST /api/reminders/send for manual trigger and testing.
 *
 * Real email/push sending -> BLOCKED.md. Dev sender only here.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import type { Event, Rsvp } from './schema';
import { createAuth } from './auth';

// ─── Dev sender ───────────────────────────────────────────────────────────────
// Replace this with a real provider integration once unblocked.
async function sendReminderDev(rsvp: Rsvp, event: Event): Promise<void> {
  console.log(
    `[DEV REMINDER] eventId=${event.id} userId=${rsvp.userId} ` +
      `title="${event.title}" state=${rsvp.state}`,
  );
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
/**
 * Schedules a reminder for all going/waitlisted RSVPs on the event.
 * Currently a no-op placeholder that logs intent. In production this would
 * enqueue a Cloudflare Queue message or set a Cron Trigger for T-1h.
 */
export async function scheduleReminders(
  sql: ReturnType<typeof neon>,
  eventId: string,
): Promise<void> {
  const db = drizzle(sql, { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
  });
  if (!event?.startsAt) {
    console.log(`[REMINDERS] Event ${eventId} has no startsAt — skipping schedule`);
    return;
  }

  const reminderAt = new Date(event.startsAt.getTime() - 60 * 60 * 1000); // T-1h
  console.log(
    `[REMINDERS] Scheduled reminder for event ${eventId} ` +
      `at ${reminderAt.toISOString()} (1h before start)`,
  );
  // TODO: enqueue to Cloudflare Queue once unblocked.
}

/**
 * Fires reminders for all going/waitlisted RSVPs on the given event.
 * In dev: logs to console. In production: calls a real provider.
 */
export async function fireReminders(
  sql: ReturnType<typeof neon>,
  eventId: string,
): Promise<{ sent: number }> {
  const db = drizzle(sql, { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
  });
  if (!event) return { sent: 0 };

  const rsvps = await db.query.rsvps.findMany({
    where: and(
      eq(schema.rsvps.eventId, eventId),
      eq(schema.rsvps.state, 'going'),
    ),
  });

  await Promise.all(rsvps.map((r) => sendReminderDev(r, event)));
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

/**
 * POST /api/reminders/send — manually fire reminders for an event (host only).
 * Used for testing in dev. In production this would be triggered by a scheduled job.
 */
remindersRouter.post('/send', async (c) => {
  const hostId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { eventId } = await c.req.json<{ eventId?: string }>();

  if (!eventId) return c.json({ error: 'eventId required' }, 400);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return c.json({ error: 'Event not found' }, 404);
  if (event.hostId !== hostId) return c.json({ error: 'Forbidden' }, 403);

  const result = await fireReminders(neon(c.env.DATABASE_URL), eventId);
  return c.json({ ...result, note: 'dev-sender-only: real provider -> BLOCKED.md' });
});
