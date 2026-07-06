/**
 * Minimal RRULE parser for watch-party recurrence.
 * Supports: FREQ=DAILY|WEEKLY|MONTHLY, COUNT, UNTIL, BYDAY (for WEEKLY).
 * A full iCalendar RRULE engine is overkill for v0; this covers the common cases.
 */

export type ParsedRule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: number[]; // 0=Sun … 6=Sat
};

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export function parseRRule(rule: string): ParsedRule {
  const parts = Object.fromEntries(
    rule.split(';').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );

  const freq = parts['FREQ'] as ParsedRule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
    throw new Error(`Unsupported FREQ: ${freq}`);
  }

  return {
    freq,
    interval: parts['INTERVAL'] ? parseInt(parts['INTERVAL'], 10) : 1,
    count: parts['COUNT'] ? parseInt(parts['COUNT'], 10) : undefined,
    until: parts['UNTIL'] ? new Date(parts['UNTIL']) : undefined,
    byDay: parts['BYDAY']
      ? parts['BYDAY'].split(',').map((d) => DAY_MAP[d]).filter((n) => n !== undefined)
      : undefined,
  };
}

/**
 * Generate occurrence start times from a base date.
 * Returns up to `maxOccurrences` dates (default 52 — one year of weekly events).
 */
export function generateOccurrences(
  dtStart: Date,
  rule: ParsedRule,
  maxOccurrences = 52,
): Date[] {
  const occurrences: Date[] = [];
  const limit = rule.count ?? maxOccurrences;
  let current = new Date(dtStart);

  while (occurrences.length < limit) {
    if (rule.until && current > rule.until) break;
    if (occurrences.length >= maxOccurrences) break;

    if (rule.freq === 'WEEKLY' && rule.byDay?.length) {
      // Expand BYDAY within the current week.
      const weekStart = new Date(current);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      for (const day of rule.byDay.sort()) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + day);
        if (d >= dtStart && (!rule.until || d <= rule.until)) {
          occurrences.push(new Date(d));
          if (occurrences.length >= limit) break;
        }
      }
      current.setDate(current.getDate() + 7 * rule.interval);
    } else {
      occurrences.push(new Date(current));
      if (rule.freq === 'DAILY') current.setDate(current.getDate() + rule.interval);
      else if (rule.freq === 'WEEKLY') current.setDate(current.getDate() + 7 * rule.interval);
      else if (rule.freq === 'MONTHLY') current.setMonth(current.getMonth() + rule.interval);
    }
  }

  return occurrences;
}
