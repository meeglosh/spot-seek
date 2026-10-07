// Evergreen "What's on" calendar + ticker for the landing page. Pure functions with an injectable
// `now`, so the selection is testable and the page never shows a past event.
//
// Rules (see also HANDOFF.md, "Landing page"):
//  - "Today" is the calendar date in America/New_York. An entry stays until that day ends: it is
//    dropped only when its end date (or start date, if it has none) is before today.
//  - Dated entries are sorted by start date, ascending. A tentative entry (month-level date) sorts
//    after the dated entries of its month and is kept until the month ends.
//  - Exactly LANDING_N rows are shown. Recurring rows count toward N and sit in fixed slots:
//    "first" recurring rows (NFL Sundays, only while an NFL season window is active) come first,
//    "last" recurring rows (your show's new episode) come last, dated rows fill the middle.
//  - The first dated row is tagged NEXT UP (ON NOW for a running multi-day entry, TODAY for a
//    single-day entry that is today). Tentative entries are never tagged.
import {
  LANDING_EVENTS,
  LANDING_RECURRING,
  type LandingEvent,
  type LandingRecurring,
} from './landing-events';

/** Number of rows shown in the calendar and the ticker (what the page showed when this was hard-coded). */
export const LANDING_N = 9;

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const TZ = 'America/New_York';

/** YYYY-MM-DD for `now` in America/New_York. */
export function easternToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function lastDayOfMonth(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** First and last calendar day an entry occupies (month-level entries span their whole month). */
function span(e: LandingEvent): { start: string; end: string } {
  if (e.tentative) return { start: `${e.start}-01`, end: lastDayOfMonth(e.start) };
  return { start: e.start, end: e.end ?? e.start };
}

function mon(d: string): string {
  return MON[Number(d.slice(5, 7)) - 1]!;
}
function day(d: string): number {
  return Number(d.slice(8, 10));
}

/** "OCT 20", "JAN 10, 2027", "MAR 14 TO APR 5, 2027", tentative "FEB 2028". Year shown when not the current year. */
export function formatDateLabel(e: LandingEvent, today: string, withYear: 'auto' | 'never' = 'auto'): string {
  const cy = today.slice(0, 4);
  if (e.tentative) return `${mon(`${e.start}-01`)} ${e.start.slice(0, 4)}`;
  const s = e.start;
  const en = e.end && e.end !== e.start ? e.end : undefined;
  const sy = s.slice(0, 4);
  if (!en) {
    return `${mon(s)} ${day(s)}${withYear === 'auto' && sy !== cy ? `, ${sy}` : ''}`;
  }
  const ey = en.slice(0, 4);
  if (sy !== ey && withYear === 'auto') return `${mon(s)} ${day(s)}, ${sy} TO ${mon(en)} ${day(en)}, ${ey}`;
  return `${mon(s)} ${day(s)} TO ${mon(en)} ${day(en)}${withYear === 'auto' && ey !== cy ? `, ${ey}` : ''}`;
}

export interface CalRow {
  id: string;
  recurring: boolean;
  dateLabel: string;
  name: string;
  note: string;
  tag?: 'NEXT UP' | 'ON NOW' | 'TODAY';
  /** Text for the orange ticker. */
  ticker: string;
}

function recurringActive(r: LandingRecurring, today: string): boolean {
  if (!r.seasons) return true;
  return r.seasons.some((s) => s.start <= today && today <= s.end);
}

/** Dated entries that have not ended yet (as of `today`), sorted ascending. */
export function upcomingEvents(today: string, events: readonly LandingEvent[] = LANDING_EVENTS): LandingEvent[] {
  const key = (e: LandingEvent) => (e.tentative ? `${lastDayOfMonth(e.start)}~` : e.start);
  return events
    .filter((e) => span(e).end >= today)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : 1));
}

/** The calendar rows (also used for the ticker): always LANDING_N rows while enough events exist. */
export function buildCalendar(
  now: Date = new Date(),
  events: readonly LandingEvent[] = LANDING_EVENTS,
  recurring: readonly LandingRecurring[] = LANDING_RECURRING,
  n: number = LANDING_N,
): CalRow[] {
  const today = easternToday(now);
  const active = recurring.filter((r) => recurringActive(r, today));
  const first = active.filter((r) => r.slot === 'first');
  const last = active.filter((r) => r.slot === 'last');
  const dated = upcomingEvents(today, events).slice(0, Math.max(0, n - active.length));

  const recRow = (r: LandingRecurring): CalRow => ({
    id: r.id,
    recurring: true,
    dateLabel: r.dateLabel,
    name: r.name,
    note: r.note,
    ticker: r.ticker,
  });
  const datedRows = dated.map((e, i): CalRow => {
    const sp = span(e);
    const running = !e.tentative && sp.start <= today;
    const multi = sp.end !== sp.start;
    const tag: CalRow['tag'] = e.tentative || i > 0 ? undefined : running ? (multi ? 'ON NOW' : 'TODAY') : 'NEXT UP';
    const tn = e.tickerName ?? e.name;
    const ticker = running
      ? `${tn} ${multi ? 'ON NOW' : 'TODAY'}`
      : `${tn} ${formatDateLabel(e, today, 'never')}`;
    return { id: e.id, recurring: false, dateLabel: formatDateLabel(e, today), name: e.name, note: e.note, tag, ticker };
  });
  return [...first.map(recRow), ...datedRows, ...last.map(recRow)];
}

export interface LandingHealth {
  /** Dated entries still to come (or running) in the next 12 months. */
  upcomingIn12Months: number;
  needed: number;
  low: boolean;
  /** Last day covered by the data (end of the furthest entry). */
  coveredThrough: string | null;
}

/** Safety net: is there enough runway of curated events? */
export function landingHealth(
  now: Date = new Date(),
  events: readonly LandingEvent[] = LANDING_EVENTS,
  n: number = LANDING_N,
): LandingHealth {
  const today = easternToday(now);
  const horizon = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const upcoming = upcomingEvents(today, events).filter((e) => span(e).start <= horizon);
  const ends = events.map((e) => span(e).end).sort();
  return {
    upcomingIn12Months: upcoming.length,
    needed: n,
    low: upcoming.length < n,
    coveredThrough: ends.length ? ends[ends.length - 1]! : null,
  };
}

/** Logs a warning when the calendar is running low. Called from the cron. Never sends email. */
export function warnIfLandingLow(
  now: Date = new Date(),
  events: readonly LandingEvent[] = LANDING_EVENTS,
  log: (msg: string) => void = (m) => console.warn(m),
): LandingHealth {
  const h = landingHealth(now, events);
  if (h.low) log(`[LANDING] calendar running low: ${h.upcomingIn12Months} entries in next 12 months (need ${h.needed}); data covers through ${h.coveredThrough}`);
  return h;
}
