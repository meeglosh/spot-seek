/**
 * Admin review (mounted under /api/admin/moderation, behind requireAdmin) and
 * the once-a-day digest email.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { notify } from '../notifications';
import { sendEmail } from '../reminders';
import { utcDay } from '../email-guard';
import { logModeration } from './screen';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const DIGEST_TO = 'hello@spotseek.app';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QueueItem = {
  id: string;
  title: string;
  hostId: string;
  hostName: string | null;
  status: string;
  moderationStatus: string;
  reportCount: number;
  reasons: Record<string, number>;
  notes: string[];
  updatedAt: Date;
  lastAction: { action: string; reason: string | null; actor: string; at: Date } | null;
};

export async function loadQueue(db: Db): Promise<QueueItem[]> {
  const events = await db
    .select()
    .from(schema.events)
    .where(inArray(schema.events.moderationStatus, ['flagged', 'hidden']))
    .orderBy(desc(schema.events.updatedAt))
    .limit(200);
  if (events.length === 0) return [];
  const ids = events.map((e) => e.id);
  const [reports, logs, hosts] = await Promise.all([
    db.select().from(schema.eventReports).where(inArray(schema.eventReports.eventId, ids)),
    db
      .select()
      .from(schema.moderationEvents)
      .where(inArray(schema.moderationEvents.eventId, ids))
      .orderBy(desc(schema.moderationEvents.createdAt)),
    db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(inArray(schema.users.id, [...new Set(events.map((e) => e.hostId))])),
  ]);
  const hostName = new Map(hosts.map((h) => [h.id, h.displayName]));
  return events.map((e) => {
    const rs = reports.filter((r) => r.eventId === e.id);
    const reasons: Record<string, number> = {};
    for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    const last = logs.find((l) => l.eventId === e.id);
    return {
      id: e.id,
      title: e.title,
      hostId: e.hostId,
      hostName: hostName.get(e.hostId) ?? null,
      status: e.status,
      moderationStatus: e.moderationStatus,
      reportCount: rs.length,
      reasons,
      notes: rs.map((r) => r.note).filter((n): n is string => !!n).slice(0, 5),
      updatedAt: e.updatedAt,
      lastAction: last ? { action: last.action, reason: last.reason, actor: last.actor, at: last.createdAt } : null,
    };
  });
}

export const moderationAdminRouter = new Hono<{ Bindings: Env }>();

moderationAdminRouter.get('/queue', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  return c.json({ events: await loadQueue(db) });
});

moderationAdminRouter.post('/events/:id/restore', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const [event] = await db
    .update(schema.events)
    .set({ moderationStatus: 'ok' })
    .where(eq(schema.events.id, id))
    .returning();
  if (!event) return c.json({ error: 'Not found' }, 404);
  await logModeration(db, { eventId: id, action: 'restored', actor: 'admin', detail: { hostId: event.hostId } });
  return c.json({ event });
});

moderationAdminRouter.post('/events/:id/remove', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'Not found' }, 404);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const existing = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!existing) return c.json({ error: 'Not found' }, 404);
  const [event] = await db
    .update(schema.events)
    .set({ moderationStatus: 'removed' })
    .where(eq(schema.events.id, id))
    .returning();
  // hostId is stored in the log so the repeat-offender count survives event deletion.
  await logModeration(db, {
    eventId: id,
    action: 'removed',
    actor: 'admin',
    detail: { hostId: existing.hostId, title: existing.title.slice(0, 120) },
  });
  if (existing.moderationStatus !== 'removed') {
    await notify(db, c.env.RESEND_API_KEY, {
      userId: existing.hostId,
      type: 'event_removed',
      title: 'Your party was taken down.',
      body: `"${existing.title}" didn't meet our community guidelines. If you think we got it wrong, write to hello@spotseek.app.`,
      eventId: id,
    }).catch((err) => console.error('[moderation] removal notify failed:', err));
  }
  return c.json({ event });
});

// ─── Daily digest ─────────────────────────────────────────────────────────────

/**
 * Emails one summary to hello@spotseek.app when the queue is non-empty. At most
 * one per UTC day: the day row in moderation_digests is claimed atomically
 * BEFORE sending (a suppressed/failed send is not retried the same day).
 */
export async function runModerationDigest(
  env: Env,
  now = new Date(),
): Promise<'empty' | 'already_sent' | 'sent'> {
  const db = drizzle(neon(env.DATABASE_URL), { schema });
  const queue = await loadQueue(db);
  if (queue.length === 0) return 'empty';

  const claimed = await db.execute(sql`
    INSERT INTO moderation_digests (day) VALUES (${utcDay(now)})
    ON CONFLICT (day) DO NOTHING RETURNING day
  `);
  if ((claimed.rows?.length ?? 0) === 0) return 'already_sent';

  const hidden = queue.filter((q) => q.moderationStatus === 'hidden').length;
  const flagged = queue.length - hidden;
  const lines = queue
    .slice(0, 20)
    .map((q) => {
      const why = Object.entries(q.reasons).map(([k, v]) => `${k} x${v}`).join(', ') || 'no reports';
      return `- [${q.moderationStatus}] "${q.title}" (${q.reportCount} reports: ${why}) id ${q.id}`;
    })
    .join('\n');
  const body =
    `${hidden} hidden and ${flagged} flagged waiting for review.\n\n${lines}` +
    (queue.length > 20 ? `\n...and ${queue.length - 20} more.` : '') +
    '\n\nReview: GET /api/admin/moderation/queue. Restore or remove: POST /api/admin/moderation/events/:id/restore|remove.';
  const subject = `Moderation queue: ${queue.length} to review`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV MODERATION DIGEST] ${subject}`);
  } else {
    await sendEmail(DIGEST_TO, subject, body, env.RESEND_API_KEY, { type: 'moderation_digest' });
  }
  return 'sent';
}
