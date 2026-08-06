import tzlookup from 'tz-lookup';

// ─── Venue timezone lookup ─────────────────────────────────────────────────
// Pure-JS, no filesystem/native deps — works in the Workers runtime.

export function lookupVenueTimezone(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return null;
  try {
    return tzlookup(lat, lng);
  } catch {
    return null; // e.g. coordinates over open ocean with no zone
  }
}

// ─── Timezone-aware formatting for emails/notifications ────────────────────
// Deliberately avoids Intl's `timeZoneName` display data (not reliably
// available on Workers/Hermes) — abbreviations are derived by matching the
// numeric UTC offset at the given instant against a known table.

// Returns the offset of `timeZone` from UTC, in minutes, at the given instant.
function getOffsetMinutes(date: Date, timeZone: string): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

// Known zone -> {standard, daylight} abbreviation + offset (minutes from UTC) pairs.
// Matched by (zone name AND closest offset) so DST is picked correctly without
// depending on ICU CLDR name data at all.
const ZONE_ABBR: Record<string, { std: { abbr: string; offset: number }; dst?: { abbr: string; offset: number } }> = {
  'America/New_York':    { std: { abbr: 'EST', offset: -300 }, dst: { abbr: 'EDT', offset: -240 } },
  'America/Chicago':     { std: { abbr: 'CST', offset: -360 }, dst: { abbr: 'CDT', offset: -300 } },
  'America/Denver':      { std: { abbr: 'MST', offset: -420 }, dst: { abbr: 'MDT', offset: -360 } },
  'America/Phoenix':     { std: { abbr: 'MST', offset: -420 } },
  'America/Los_Angeles': { std: { abbr: 'PST', offset: -480 }, dst: { abbr: 'PDT', offset: -420 } },
  'America/Anchorage':   { std: { abbr: 'AKST', offset: -540 }, dst: { abbr: 'AKDT', offset: -480 } },
  'Pacific/Honolulu':    { std: { abbr: 'HST', offset: -600 } },
  'Europe/London':       { std: { abbr: 'GMT', offset: 0 }, dst: { abbr: 'BST', offset: 60 } },
  'Europe/Dublin':       { std: { abbr: 'GMT', offset: 0 }, dst: { abbr: 'IST', offset: 60 } },
  'Europe/Paris':        { std: { abbr: 'CET', offset: 60 }, dst: { abbr: 'CEST', offset: 120 } },
  'Europe/Berlin':       { std: { abbr: 'CET', offset: 60 }, dst: { abbr: 'CEST', offset: 120 } },
  'Europe/Madrid':       { std: { abbr: 'CET', offset: 60 }, dst: { abbr: 'CEST', offset: 120 } },
  'Europe/Rome':         { std: { abbr: 'CET', offset: 60 }, dst: { abbr: 'CEST', offset: 120 } },
  'Europe/Amsterdam':    { std: { abbr: 'CET', offset: 60 }, dst: { abbr: 'CEST', offset: 120 } },
  'Europe/Athens':       { std: { abbr: 'EET', offset: 120 }, dst: { abbr: 'EEST', offset: 180 } },
  'Asia/Tokyo':          { std: { abbr: 'JST', offset: 540 } },
  'Asia/Shanghai':       { std: { abbr: 'CST', offset: 480 } },
  'Asia/Kolkata':        { std: { abbr: 'IST', offset: 330 } },
  'Asia/Manila':         { std: { abbr: 'PST', offset: 480 } },
  'Australia/Sydney':    { std: { abbr: 'AEST', offset: 600 }, dst: { abbr: 'AEDT', offset: 660 } },
};

export function timezoneAbbreviation(date: Date, timeZone: string): string {
  const offset = getOffsetMinutes(date, timeZone);
  const entry = ZONE_ABBR[timeZone];
  if (entry) {
    if (entry.dst && Math.abs(offset - entry.dst.offset) < Math.abs(offset - entry.std.offset)) return entry.dst.abbr;
    return entry.std.abbr;
  }
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

// Regions that conventionally use a 12-hour AM/PM clock rather than 24-hour.
function usesTwelveHourClock(timeZone: string): boolean {
  if (timeZone.startsWith('America/')) return true;
  return ['Asia/Manila', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo'].includes(timeZone);
}

export function formatEventDateTime(startsAt: Date | string, venueTimezone: string | null): { dateStr: string; timeStr: string } {
  const date = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const tz = venueTimezone ?? 'UTC';
  const hour12 = venueTimezone ? usesTwelveHourClock(tz) : false;
  const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  const timeParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12 }).format(date);
  const abbr = venueTimezone ? timezoneAbbreviation(date, tz) : 'UTC';
  return { dateStr, timeStr: `${timeParts} ${abbr}` };
}
