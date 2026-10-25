/**
 * Event content screening + moderation state helpers shared by events.ts, the
 * report endpoint and the admin routes.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema';
import { matchBlocklistFields, matchFlagRules } from './blocklist';
import { classifierEnabled, classifyText, REJECT_CATEGORIES } from './classifier';

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
  | { verdict: 'flag'; categories: string[] }
  // Soft-rule hit: the event is created/kept HIDDEN until an admin reviews it. Wins over 'flag'.
  | { verdict: 'hold'; categories: string[] };

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

export const CLASSIFIER_UNAVAILABLE = 'classifier_unavailable';
const RULE_PREFIX = 'rule:';

/** Moderation-log `reason` for a flag/hold verdict, derived from its categories. */
export function flagReason(categories: string[]): string {
  if (categories.includes(CLASSIFIER_UNAVAILABLE)) return CLASSIFIER_UNAVAILABLE;
  if (categories.some((c) => c.startsWith(RULE_PREFIX))) return 'blocklist_rule';
  return 'classifier';
}

/**
 * 1. Hard blocklist: reject (fail closed).
 * 2. Classifier: a reject category rejects; other unsafe categories flag.
 * 3. Soft rules (group-vs-group violence, "religion war"): hold (hidden pending
 *    review). A rule hit wins over a classifier flag.
 * 4. Classifier outage (null while enabled): flag, so the event is published but
 *    lands in the admin queue instead of silently passing. Flagged stays live.
 */
export async function screenEventContent(env: Env, f: ScreenFields): Promise<ScreenResult> {
  const fields = [f.title, f.description, f.venueName, f.venueAddress, f.broadcastSubject];
  const hit = matchBlocklistFields(fields);
  if (hit) return { verdict: 'reject', source: 'blocklist', detail: hit };

  const rule = matchFlagRules(fields);
  const text = joinFields(f);
  const res = await classifyText(env, text);
  if (res && !res.safe) {
    const bad = res.categories.filter((c) => REJECT_CATEGORIES.has(c));
    if (bad.length > 0) return { verdict: 'reject', source: 'classifier', detail: bad.join(',') };
    return rule
      ? { verdict: 'hold', categories: [...res.categories, RULE_PREFIX + rule] }
      : { verdict: 'flag', categories: res.categories };
  }
  if (rule) return { verdict: 'hold', categories: [RULE_PREFIX + rule] };
  if (!res && text.trim() && classifierEnabled(env)) {
    console.error('[moderation] classifier unavailable at screening, holding event for review');
    return { verdict: 'flag', categories: [CLASSIFIER_UNAVAILABLE] };
  }
  return { verdict: 'ok' };
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
