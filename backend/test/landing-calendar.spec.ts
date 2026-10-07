import { describe, it, expect, vi } from 'vitest';
import {
  buildCalendar,
  easternToday,
  landingHealth,
  warnIfLandingLow,
  LANDING_N,
  upcomingEvents,
} from '../src/landing-calendar';
import { LANDING_EVENTS, LANDING_RECURRING, type LandingEvent } from '../src/landing-events';
import { renderHomePage } from '../src/homepage';

// Noon Eastern on a date (EST/EDT safe: 17:00Z is noon EST, 16:00Z is noon EDT; both stay the same ET day).
const at = (iso: string) => new Date(`${iso}T17:00:00Z`);
const ev = (id: string, start: string, extra: Partial<LandingEvent> = {}): LandingEvent => ({
  id, kind: 'sports', name: id.toUpperCase(), note: 'n', start, source: 'https://example.test', ...extra,
});

describe('landing calendar', () => {
  it('excludes a past entry', () => {
    const rows = buildCalendar(at('2026-10-21'));
    expect(rows.map((r) => r.id)).not.toContain('nba-open-2026');
    expect(buildCalendar(at('2026-10-19')).map((r) => r.id)).toContain('nba-open-2026');
  });

  it('keeps an entry through the end of its own day (America/New_York), drops it the next day', () => {
    // 2026-10-21 03:30Z is still Oct 20, 11:30pm EDT.
    const lateOnTheDay = new Date('2026-10-21T03:30:00Z');
    expect(easternToday(lateOnTheDay)).toBe('2026-10-20');
    const rows = buildCalendar(lateOnTheDay);
    const row = rows.find((r) => r.id === 'nba-open-2026')!;
    expect(row).toBeTruthy();
    expect(row.tag).toBe('TODAY');
    // 04:30Z is already Oct 21 EDT.
    expect(buildCalendar(new Date('2026-10-21T04:30:00Z')).map((r) => r.id)).not.toContain('nba-open-2026');
  });

  it('shows ON NOW while a range is running, and NEXT UP before it starts', () => {
    const during = buildCalendar(at('2027-03-20'));
    const mm = during.find((r) => r.id === 'march-madness-2027')!;
    expect(mm.tag).toBe('ON NOW');
    expect(mm.ticker).toBe('MARCH MADNESS ON NOW');
    const before = buildCalendar(at('2027-02-10'));
    expect(before.find((r) => r.tag)!.id).toBe('super-bowl-2027');
    expect(before.find((r) => r.tag)!.tag).toBe('NEXT UP');
    // Last day of the range is still shown.
    expect(buildCalendar(at('2027-04-05')).map((r) => r.id)).toContain('march-madness-2027');
    expect(buildCalendar(at('2027-04-06')).map((r) => r.id)).not.toContain('march-madness-2027');
  });

  it('always yields exactly N rows, with recurring rows counted and pinned first/last', () => {
    for (const d of ['2026-10-06', '2027-01-15', '2027-06-01', '2027-11-20', '2028-02-20', '2028-06-01']) {
      const rows = buildCalendar(at(d));
      expect(rows, d).toHaveLength(LANDING_N);
      expect(rows[rows.length - 1]!.id).toBe('weekly-show');
      const dated = rows.filter((r) => !r.recurring);
      expect(dated.length + rows.filter((r) => r.recurring).length).toBe(LANDING_N);
    }
    expect(buildCalendar(at('2026-10-06'))[0]!.id).toBe('nfl-sundays');
  });

  it('hides NFL Sundays in the offseason and backfills with another dated entry', () => {
    const rows = buildCalendar(at('2027-06-01'));
    expect(rows.map((r) => r.id)).not.toContain('nfl-sundays');
    expect(rows).toHaveLength(LANDING_N);
    expect(rows.filter((r) => !r.recurring)).toHaveLength(LANDING_N - 1);
    expect(buildCalendar(at('2027-10-05')).map((r) => r.id)).toContain('nfl-sundays');
  });

  it('renders tentative dates at month level, sorted after dated entries of that month, never tagged', () => {
    const events = [ev('a', '2028-02-13'), ev('t', '2028-02', { tentative: true }), ev('b', '2028-02-20')];
    const rows = buildCalendar(at('2028-01-10'), events, [], 9);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 't']);
    expect(rows[2]!.dateLabel).toBe('FEB 2028');
    expect(rows[2]!.ticker).toBe('T FEB 2028');
    expect(rows[2]!.tag).toBeUndefined();
    expect(rows[0]!.tag).toBe('NEXT UP');
    // A tentative month stays through its last day, then goes.
    expect(buildCalendar(at('2028-02-29'), events, [], 9).map((r) => r.id)).toEqual(['t']);
    expect(buildCalendar(at('2028-03-01'), events, [], 9)).toEqual([]);
  });

  it('formats dates: year only when not the current year', () => {
    const rows = buildCalendar(at('2026-10-06'));
    expect(rows.find((r) => r.id === 'nba-open-2026')!.dateLabel).toBe('OCT 20');
    expect(rows.find((r) => r.id === 'golden-globes-2027')!.dateLabel).toBe('JAN 10, 2027');
    expect(rows.find((r) => r.id === 'golden-globes-2027')!.ticker).toBe('GOLDEN GLOBES JAN 10');
    const mm = buildCalendar(at('2027-03-01')).find((r) => r.id === 'march-madness-2027')!;
    expect(mm.dateLabel).toBe('MAR 14 TO APR 5');
  });

  it('the low-entry warning fires when fewer than N entries remain in 12 months', () => {
    const few = LANDING_EVENTS.slice(0, 3);
    const log = vi.fn();
    const h = warnIfLandingLow(at('2026-10-06'), few, log);
    expect(h.low).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/^\[LANDING\] calendar running low: \d+ entries in next 12 months/);
    const ok = vi.fn();
    expect(warnIfLandingLow(at('2026-10-06'), LANDING_EVENTS, ok).low).toBe(false);
    expect(ok).not.toHaveBeenCalled();
  });

  it('the curated data is healthy now and has at least 24 months of runway, with sources', () => {
    const h = landingHealth(at('2026-10-06'));
    expect(h.low).toBe(false);
    expect(h.upcomingIn12Months).toBeGreaterThanOrEqual(LANDING_N);
    expect(h.coveredThrough! >= '2028-11-01').toBe(true);
    for (const e of LANDING_EVENTS) {
      expect(e.source, e.id).toMatch(/^https:\/\//);
      expect(e.tentative ? /^\d{4}-\d{2}$/.test(e.start) : /^\d{4}-\d{2}-\d{2}$/.test(e.start), e.id).toBe(true);
      if (e.end) expect(e.end >= e.start, e.id).toBe(true);
    }
    expect(new Set(LANDING_EVENTS.map((e) => e.id)).size).toBe(LANDING_EVENTS.length);
    for (const r of LANDING_RECURRING.flatMap((x) => x.seasons ?? [])) expect(r.end > r.start).toBe(true);
  });

  it('jumping now to 2028-06-01: still a full list with nothing in the past', () => {
    const now = at('2028-06-01');
    const today = easternToday(now);
    const rows = buildCalendar(now);
    expect(rows).toHaveLength(LANDING_N);
    const byId = new Map(LANDING_EVENTS.map((e) => [e.id, e]));
    for (const r of rows.filter((x) => !x.recurring)) {
      const e = byId.get(r.id)!;
      const end = e.tentative ? `${e.start}-31` : (e.end ?? e.start);
      expect(end >= today, r.id).toBe(true);
    }
    expect(upcomingEvents(today).every((e) => (e.end ?? e.start) >= today.slice(0, 7))).toBe(true);
    expect(rows.map((r) => r.id)).not.toContain('nfl-sundays');
  });

  it('the rendered page uses the injectable clock for calendar, ticker, and NEXT UP', () => {
    const html = renderHomePage({ baseUrl: 'https://spotseek.app', now: at('2027-03-20') });
    expect(html).not.toContain('NBA SEASON STARTS');
    expect(html).toContain('MARCH MADNESS');
    expect(html).toContain('<span class="fx__tag">ON NOW</span>');
    expect(html).toContain('MARCH MADNESS ON NOW');
    expect((html.match(/<li class="fx/g) ?? []).length).toBe(LANDING_N);
    const ticker = html.slice(html.indexOf('ticker__track'), html.indexOf('</ul>', html.indexOf('ticker__track')));
    expect((ticker.match(/<li>/g) ?? []).length).toBe(LANDING_N);
    expect((ticker.match(/<li aria-hidden/g) ?? []).length).toBe(LANDING_N);
    const early = renderHomePage({ baseUrl: 'https://spotseek.app', now: at('2026-10-06') });
    expect(early).toContain('YOUR WATCH PARTY');
    expect(early).toContain('<dd>You pick</dd>');
    expect(early).not.toMatch(/oscars night/i);
    expect(early).toContain('<span class="fx__tag">NEXT UP</span>');
    expect(early).toContain('NFL SUNDAYS');
  });
});
