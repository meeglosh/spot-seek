/**
 * Moderation routes for the app:
 *   POST   /api/events/:id/report   (reportRouter)
 *   POST   /api/users/:id/block     (blocksRouter)
 *   DELETE /api/users/:id/block
 *   GET    /api/users/blocked
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { REPORT_REASONS } from '../schema';
import type { ReportReason } from '../schema';
import { createAuth } from '../auth';
import { notify } from '../notifications';
import { allowRequest, tooManyRequests } from '../ratelimit';
import { classifyText } from './classifier';
import { logModeration, markFlagged } from './screen';
import { matchBlocklistFields } from './blocklist';
import { canViewEvent } from './visibility';

type AppEnv = { Bindings: Env; Variables: { userId: string } };
type Db = ReturnType<typeof drizzle<typeof schema>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REPORT_LIMIT_PER_MIN = 10;
export const REPORT_AUTO_HIDE_DISTINCT_REPORTERS = 3;
export const NOTE_MAX = 500;

async function requireUser(c: import('hono').Context<AppEnv>, next: import('hono').Next) {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export const reportRouter = new Hono<AppEnv>();

reportRouter.use('/:id/report', requireUser);
reportRouter.post('/:id/report', async (c) => {
  const userId = c.get('userId');
  // Reuses the RSVP_LIMITER binding under its own key (no new wrangler binding).
  if (!(await allowRequest(c.env.RSVP_LIMITER, `report:${userId}`, REPORT_LIMIT_PER_MIN))) return tooManyRequests();

  const eventId = c.req.param('id');
  let body: { reason?: unknown; note?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }
  if (typeof body.reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(body.reason)) {
    return c.json({ error: 'invalid_reason', reasons: REPORT_REASONS }, 400);
  }
  const reason = body.reason as ReportReason;
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') return c.json({ error: 'invalid_note' }, 400);
    note = body.note.trim() || null;
    if (note && note.length > NOTE_MAX) return c.json({ error: 'note_too_long', max: NOTE_MAX }, 400);
  }

  if (!UUID_RE.test(eventId)) return c.json({ error: 'Not found' }, 404);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  // Reporters can only report what they can see (drafts and hidden events 404).
  if (!event || !canViewEvent(event, userId)) return c.json({ error: 'Not found' }, 404);
  if (event.hostId === userId) return c.json({ error: 'cannot_report_own_event' }, 403);

  const inserted = await db
    .insert(schema.eventReports)
    .values({ eventId, reporterId: userId, reason, note })
    .onConflictDoNothing({ target: [schema.eventReports.eventId, schema.eventReports.reporterId] })
    .returning({ id: schema.eventReports.id });
  if (inserted.length === 0) return c.json({ reported: true, duplicate: true });

  try {
    await evaluateReports(c.env, db, event, c.env.RESEND_API_KEY);
  } catch (err) {
    // The report itself is stored; auto-action can be retried by the next report or admin review.
    console.error('[moderation] auto-action failed:', err);
  }
  return c.json({ reported: true, duplicate: false }, 201);
});

/** Auto-hide rules. Exported for tests. Returns the rule that fired, or null. */
export async function evaluateReports(
  env: Env,
  db: Db,
  event: schema.Event,
  resendApiKey: string | undefined,
): Promise<string | null> {
  if (event.moderationStatus === 'hidden' || event.moderationStatus === 'removed') return null;

  // Only reports since the last admin restore count, so a restored event is not
  // instantly re-hidden by the same old reports.
  const [lastRestore] = await db
    .select({ at: schema.moderationEvents.createdAt })
    .from(schema.moderationEvents)
    .where(and(eq(schema.moderationEvents.eventId, event.id), eq(schema.moderationEvents.action, 'restored')))
    .orderBy(desc(schema.moderationEvents.createdAt))
    .limit(1);
  const since = lastRestore?.at ?? new Date(0);
  const reports = await db
    .select({ reporterId: schema.eventReports.reporterId, reason: schema.eventReports.reason })
    .from(schema.eventReports)
    .where(and(eq(schema.eventReports.eventId, event.id), gt(schema.eventReports.createdAt, since)));
  const reporters = new Set(reports.map((r) => r.reporterId));
  const reasons: Record<string, number> = {};
  for (const r of reports) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

  let flagged = event.moderationStatus === 'flagged';
  if (!flagged) {
    // Re-run the screens now that someone objected. Classifier fails open.
    const text = [event.title, event.broadcastSubject, event.venueName, event.description].filter(Boolean).join('\n');
    const hit = matchBlocklistFields([event.title, event.description, event.venueName, event.venueAddress, event.broadcastSubject]);
    const res = hit ? null : await classifyText(env, text);
    if (hit || (res && !res.safe)) {
      flagged = true;
      if (await markFlagged(db, event.id)) {
        await logModeration(db, {
          eventId: event.id,
          action: 'auto_flagged',
          reason: hit ? 'blocklist_on_report' : 'classifier_on_report',
          actor: 'system',
          detail: { categories: res?.categories ?? [] },
        });
      }
    }
  }

  let rule: string | null = null;
  if (reasons.hate) rule = 'hate_report';
  else if (flagged && reports.length >= 1) rule = 'flagged_plus_report';
  else if (reporters.size >= REPORT_AUTO_HIDE_DISTINCT_REPORTERS) rule = 'three_reporters';
  if (!rule) return null;

  const hidden = await db
    .update(schema.events)
    .set({ moderationStatus: 'hidden' })
    .where(and(eq(schema.events.id, event.id), inArray(schema.events.moderationStatus, ['ok', 'flagged'])))
    .returning({ id: schema.events.id });
  if (hidden.length === 0) return null; // someone else already hid it; notify once only

  await logModeration(db, {
    eventId: event.id,
    action: 'auto_hidden',
    reason: rule,
    actor: 'system',
    detail: { reportCount: reports.length, distinctReporters: reporters.size, reasons, hostId: event.hostId },
  });
  // RSVPs are kept untouched. Tell the host (in-app + guarded email).
  await notify(db, resendApiKey, {
    userId: event.hostId,
    type: 'event_under_review',
    title: 'Your party is under review.',
    body: `We hid "${event.title}" while we take a look. Your RSVPs are safe. Questions? Write to hello@spotseek.app.`,
    eventId: event.id,
  }).catch((err) => console.error('[moderation] host notify failed:', err));
  return rule;
}

// ─── Blocking ─────────────────────────────────────────────────────────────────

export const blocksRouter = new Hono<AppEnv>();
blocksRouter.use('*', requireUser);

blocksRouter.get('/blocked', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rows = await db
    .select({
      userId: schema.users.id,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      blockedAt: schema.userBlocks.createdAt,
    })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
    .where(eq(schema.userBlocks.blockerId, c.get('userId')))
    .orderBy(desc(schema.userBlocks.createdAt));
  return c.json({ blocks: rows });
});

blocksRouter.post('/:id/block', async (c) => {
  const blockerId = c.get('userId');
  const blockedId = c.req.param('id');
  if (blockedId === blockerId) return c.json({ error: 'cannot_block_self' }, 400);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, blockedId) });
  if (!target) return c.json({ error: 'User not found' }, 404);
  await db.insert(schema.userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
  return c.json({ blocked: true }, 201);
});

blocksRouter.delete('/:id/block', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  await db
    .delete(schema.userBlocks)
    .where(and(eq(schema.userBlocks.blockerId, c.get('userId')), eq(schema.userBlocks.blockedId, c.req.param('id'))));
  return c.json({ blocked: false });
});

/** True when `hostId` has blocked `userId` (the attendee). */
export async function isBlockedByHost(db: Db, hostId: string, userId: string): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT 1 FROM user_blocks WHERE blocker_id = ${hostId} AND blocked_id = ${userId} LIMIT 1`,
  );
  return (rows.rows?.length ?? 0) > 0;
}
