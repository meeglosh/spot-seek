/**
 * Who may see an event.
 *
 *  - draft: host (and admin) only.
 *  - published / cancelled / completed: everyone. Cancelled and completed stay
 *    reachable on purpose: attendees open their link and must see "cancelled".
 *  - moderation_status hidden | removed: host (and admin) only; for everyone
 *    else the event behaves as if it does not exist. `flagged` is still live.
 *
 * Discovery surfaces (feed, search, sitemap) are stricter: published only.
 */
import { sql, notInArray, eq, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import { neon } from '@neondatabase/serverless';
import * as schema from '../schema';
import { createAuth } from '../auth';

export const MOD_HIDDEN = ['hidden', 'removed'] as const;

export function isModerationHidden(event: Pick<schema.Event, 'moderationStatus'>): boolean {
  return event.moderationStatus === 'hidden' || event.moderationStatus === 'removed';
}

export function canViewEvent(
  event: Pick<schema.Event, 'hostId' | 'status' | 'moderationStatus'>,
  viewerId: string | null | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  if (viewerId && viewerId === event.hostId) return true;
  if (event.status === 'draft') return false;
  return !isModerationHidden(event);
}

/** SQL for discovery: published and not hidden/removed. */
export function discoverableEventSql(): SQL {
  return and(
    eq(schema.events.status, 'published'),
    notInArray(schema.events.moderationStatus, [...MOD_HIDDEN]),
  ) as SQL;
}

/**
 * SQL: no block in either direction between `userId` and the event's host.
 * Used by the feed so blockers do not see blocked hosts and blocked users do
 * not see the blocker's events.
 */
export function notBlockedWithHostSql(userId: string): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM user_blocks b
    WHERE (b.blocker_id = ${userId} AND b.blocked_id = ${schema.events.hostId})
       OR (b.blocker_id = ${schema.events.hostId} AND b.blocked_id = ${userId})
  )`;
}

/** Best-effort session user id; null when signed out or on any error. */
export async function optionalViewerId(c: Context<{ Bindings: Env }>): Promise<string | null> {
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}
