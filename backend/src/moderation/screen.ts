/**
 * Event content screening + moderation state helpers shared by events.ts, the
 * report endpoint and the admin routes.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema';
import { matchBlocklistFields } from './blocklist';
import { classifyText, REJECT_CATEGORIES } from './classifier';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const REJECT_MESSAGE = "This doesn't meet our community guidelines.";

export type ScreenFields = {
  title?: string | null;
  description?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  broadcastSubject?: string | null;
};

export type ScreenResult =
  | { verdict: 'ok' }
  | { verdict: 'reject'; source: 'blocklist' | 'classifier'; detail: string }
  | { verdict: 'flag'; categories: string[] };

function joinFields(f: ScreenFields): string {
  return [
    f.title && `Title: ${f.title}`,
    f.broadcastSubject && `Topic: ${f.broadcastSubject}`,
    f.venueName && `Venue: ${f.venueName}`,
    f.description && `Description: ${f.description}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Blocklist first (fail closed), then the classifier (fail open). */
export async function screenEventContent(env: Env, f: ScreenFields): Promise<ScreenResult> {
  const hit = matchBlocklistFields([f.title, f.description, f.venueName, f.venueAddress, f.broadcastSubject]);
  if (hit) return { verdict: 'reject', source: 'blocklist', detail: hit };

  const res = await classifyText(env, joinFields(f));
  if (!res || res.safe) return { verdict: 'ok' };
  const bad = res.categories.filter((c) => REJECT_CATEGORIES.has(c));
  if (bad.length > 0) return { verdict: 'reject', source: 'classifier', detail: bad.join(',') };
  return { verdict: 'flag', categories: res.categories };
}

export async function logModeration(
  db: Db,
  row: {
    eventId: string | null;
    action: 'auto_hidden' | 'auto_flagged' | 'blocked_on_publish' | 'restored' | 'removed';
    reason?: string | null;
    actor: 'system' | 'admin';
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(schema.moderationEvents).values({
      eventId: row.eventId,
      action: row.action,
      reason: row.reason ?? null,
      actor: row.actor,
      detail: row.detail ?? null,
    });
  } catch (err) {
    console.error('[moderation] log write failed:', err);
  }
}

export const REPEAT_OFFENDER_THRESHOLD = 2;
export const REPEAT_OFFENDER_DAYS = 90;

/**
 * Hosts with >= 2 events removed in the last 90 days cannot publish. Counted
 * from the moderation log (stores hostId) so deleting a removed event does not
 * reset the count; a later `restored` entry for the same event cancels it.
 */
export async function isPublishingPaused(db: Db, hostId: string): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT COUNT(DISTINCT m.event_id) AS n
    FROM moderation_events m
    WHERE m.action = 'removed'
      AND m.detail->>'hostId' = ${hostId}
      AND m.created_at > now() - make_interval(days => ${REPEAT_OFFENDER_DAYS})
      AND NOT EXISTS (
        SELECT 1 FROM moderation_events r
        WHERE r.event_id = m.event_id AND r.action = 'restored' AND r.created_at > m.created_at
      )
  `);
  return Number((res.rows?.[0] as { n?: string | number } | undefined)?.n ?? 0) >= REPEAT_OFFENDER_THRESHOLD;
}

/** ok -> flagged only; never downgrades hidden/removed. Returns true when it changed. */
export async function markFlagged(db: Db, eventId: string): Promise<boolean> {
  const rows = await db
    .update(schema.events)
    .set({ moderationStatus: 'flagged' })
    .where(and(eq(schema.events.id, eventId), eq(schema.events.moderationStatus, 'ok')))
    .returning({ id: schema.events.id });
  return rows.length > 0;
}
