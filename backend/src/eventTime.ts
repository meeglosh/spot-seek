/**
 * When is a party over? The ONE server-side definition. The app mirrors it in
 * app/lib/eventTime.ts (keep the two in step).
 *
 *  - ended:    endsAt < now, or, with no endsAt, startsAt < now - 4h.
 *  - live:     started and not yet ended.
 *  - upcoming: not started yet. A party with no date at all is never "ended".
 *
 * All comparisons are on instants (UTC timestamps), never local dates, so the
 * venue timezone cannot shift the answer.
 */
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import * as schema from './schema';

/** Default length of a watch party when the host gave no end time. */
export const DEFAULT_EVENT_DURATION_HOURS = 4;
export const DEFAULT_EVENT_DURATION_MS = DEFAULT_EVENT_DURATION_HOURS * 60 * 60 * 1000;

/** How far back `include=past` reaches. */
export const PAST_WINDOW_DAYS = 30;
export const PAST_WINDOW_MS = PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type EventPhase = 'upcoming' | 'live' | 'ended';

type Timed = { startsAt: Date | string | null; endsAt: Date | string | null };

const ms = (d: Date | string | null): number | null => (d == null ? null : new Date(d).getTime());

/** The instant the party is considered over, or null for an undated party. */
export function effectiveEndMs(e: Timed): number | null {
  const end = ms(e.endsAt);
  if (end != null) return end;
  const start = ms(e.startsAt);
  return start == null ? null : start + DEFAULT_EVENT_DURATION_MS;
}

export function eventPhase(e: Timed, now: Date | number = new Date()): EventPhase {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const end = effectiveEndMs(e);
  if (end != null && end < nowMs) return 'ended';
  const start = ms(e.startsAt);
  if (start != null && start <= nowMs) return 'live';
  return 'upcoming';
}

/** SQL twin of effectiveEndMs: endsAt, else startsAt + 4h (null when undated). */
export function effectiveEndSql(): SQL {
  return sql`coalesce(${schema.events.endsAt}, ${schema.events.startsAt} + make_interval(hours => ${DEFAULT_EVENT_DURATION_HOURS}))`;
}

/** SQL: dated, and not ended (upcoming or in progress). */
export function upcomingOrLiveSql(): SQL {
  return sql`(${schema.events.startsAt} is not null and ${effectiveEndSql()} >= now())`;
}

/** SQL: ended, no more than PAST_WINDOW_DAYS ago. */
export function recentlyEndedSql(): SQL {
  return sql`(${effectiveEndSql()} < now() and ${effectiveEndSql()} >= now() - make_interval(days => ${PAST_WINDOW_DAYS}))`;
}
