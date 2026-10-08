import { describe, it, expect } from 'vitest';
import { eventPhase, effectiveEndMs, DEFAULT_EVENT_DURATION_MS } from '../src/eventTime';

const NOW = Date.parse('2026-10-08T20:00:00Z');
const H = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('eventPhase (server)', () => {
  it('uses a 4h default length when there is no endsAt', () => {
    expect(DEFAULT_EVENT_DURATION_MS).toBe(4 * H);
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: null }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-4 * H), endsAt: null }, NOW)).toBe('live'); // exact boundary
    expect(eventPhase({ startsAt: iso(-4 * H - 1), endsAt: null }, NOW)).toBe('ended');
  });
  it('ended means endsAt < now; the exact instant is still live', () => {
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: iso(0) }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: iso(-1) }, NOW)).toBe('ended');
  });
  it('is upcoming before the start and live from the start instant', () => {
    expect(eventPhase({ startsAt: iso(1), endsAt: null }, NOW)).toBe('upcoming');
    expect(eventPhase({ startsAt: iso(0), endsAt: null }, NOW)).toBe('live');
  });
  it('never calls an undated party ended', () => {
    expect(eventPhase({ startsAt: null, endsAt: null }, NOW)).toBe('upcoming');
    expect(effectiveEndMs({ startsAt: null, endsAt: null })).toBeNull();
  });
  it('accepts Date objects and ISO strings alike', () => {
    expect(eventPhase({ startsAt: new Date(NOW - 9 * H), endsAt: null }, new Date(NOW))).toBe('ended');
  });
});
