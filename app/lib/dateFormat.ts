// Venue-timezone-aware date/time formatting.
//
// Deliberately avoids depending on Hermes/React Native's Intl CLDR
// locale-name data (unreliable across engines) — only baseline `timeZone`
// support is relied on, never `timeZoneName`.

// Returns the offset of `timeZone` from UTC, in minutes, at the given instant.
// Cross-engine-safe: relies only on Intl's `timeZone` option (baseline, always available),
// never on `timeZoneName` display data (unreliable on Hermes).
function getOffsetMinutes(date: Date, timeZone: string): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

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

function usesTwelveHourClock(timeZone: string): boolean {
  if (timeZone.startsWith('America/')) return true;
  return ['Asia/Manila', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo'].includes(timeZone);
}

// Formats an event's start time in its VENUE's timezone (falls back to the
// device's local timezone if the event has no venue coordinates / no
// venueTimezone, e.g. online-only events).
export function formatEventDateTime(startsAt: string | Date, venueTimezone: string | null): { dateStr: string; timeStr: string } {
  const date = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const tz = venueTimezone ?? undefined; // undefined lets Intl use the device's local zone
  const hour12 = venueTimezone ? usesTwelveHourClock(venueTimezone) : true; // device fallback: default to 12h (matches prior app convention for US-first userbase); adjust only if you find evidence otherwise in the codebase
  const dateStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12 }).format(date);
  const abbr = venueTimezone ? timezoneAbbreviation(date, venueTimezone) : ''; // no abbreviation for device-local fallback — ambiguous what to label it
  return { dateStr, timeStr: abbr ? `${timePart} ${abbr}` : timePart };
}
