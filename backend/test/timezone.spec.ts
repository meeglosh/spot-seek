import { describe, it, expect } from 'vitest';
import { timezoneAbbreviation, formatEventDateTime, lookupVenueTimezone } from '../src/timezone';

describe('timezoneAbbreviation', () => {
  it('returns EDT for America/New_York in July (DST)', () => {
    expect(timezoneAbbreviation(new Date('2026-07-15T18:00:00Z'), 'America/New_York')).toBe('EDT');
  });

  it('returns EST for America/New_York in January (standard time)', () => {
    expect(timezoneAbbreviation(new Date('2026-01-15T18:00:00Z'), 'America/New_York')).toBe('EST');
  });

  // Pins the Hermes regression: getOffsetMinutes previously round-tripped
  // through `new Date(toLocaleString())`, which Hermes cannot parse (only
  // ISO 8601 parses reliably there), yielding NaN and always falling through
  // to the standard-time abbreviation regardless of actual DST state.
  it('returns EDT (not EST) for America/New_York in August (DST regression pin)', () => {
    expect(timezoneAbbreviation(new Date('2026-08-03T23:00:00Z'), 'America/New_York')).toBe('EDT');
  });

  it('returns EST for America/New_York in mid-January (DST regression pin)', () => {
    expect(timezoneAbbreviation(new Date('2026-01-15T23:00:00Z'), 'America/New_York')).toBe('EST');
  });

  // Zones outside ZONE_ABBR fall through to the GMT±H:MM computed fallback,
  // which directly renders the NaN from a broken getOffsetMinutes as
  // "GMT+NaN" — this pins that the offset is a finite, correct value instead.
  it('renders a finite GMT offset for an unknown zone (Asia/Kathmandu, UTC+5:45 year-round)', () => {
    expect(timezoneAbbreviation(new Date('2026-08-03T23:00:00Z'), 'Asia/Kathmandu')).toBe('GMT+5:45');
  });
});

describe('formatEventDateTime', () => {
  it('falls back to UTC when venueTimezone is null', () => {
    const { timeStr } = formatEventDateTime('2026-07-15T18:00:00Z', null);
    expect(timeStr.endsWith('UTC')).toBe(true);
  });

  it('formats an America/New_York event in 12-hour clock with EDT abbreviation', () => {
    const { timeStr } = formatEventDateTime('2026-07-15T20:00:00Z', 'America/New_York');
    expect(timeStr).toBe('4:00 PM EDT');
  });
});

describe('lookupVenueTimezone', () => {
  it('resolves NYC coordinates to America/New_York', () => {
    expect(lookupVenueTimezone(40.7128, -74.006)).toBe('America/New_York');
  });

  it('returns null when lat/lng are missing', () => {
    expect(lookupVenueTimezone(null, null)).toBeNull();
  });
});
