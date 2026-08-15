// Venue-timezone-aware date/time formatting.
//
// Deliberately avoids depending on Hermes/React Native's Intl CLDR
// locale-name data (unreliable across engines) — only baseline `timeZone`
// support is relied on, never `timeZoneName`.
import { currentDisplayLocale } from './i18n';

// Maps the app's active i18n language to a full Intl locale tag for
// Intl.DateTimeFormat below. Only baseline `timeZone`/numeric formatting is
// relied on (see the file-level comment), so these tags just need to steer
// month/weekday names and ordering — they don't need to be the "canonical"
// regional variant.
const INTL_LOCALE: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-PT',
};

function activeIntlLocale(): string {
  return INTL_LOCALE[currentDisplayLocale()] ?? 'en-US';
}

// Returns the offset of `timeZone` from UTC, in minutes, at the given instant.
// Cross-engine-safe: uses formatToParts (reliable on Hermes AND V8) rather than
// re-parsing toLocaleString output through new Date(), which Hermes cannot parse
// (Hermes only reliably parses ISO 8601 — the en-US toLocaleString format comes
// back as Invalid Date/NaN).
function getOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  // hour12:false can yield hour 24 for midnight in some engines — normalize.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
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
  const locale = activeIntlLocale();
  const dateStr = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12 }).format(date);
  const abbr = venueTimezone ? timezoneAbbreviation(date, venueTimezone) : ''; // no abbreviation for device-local fallback — ambiguous what to label it
  return { dateStr, timeStr: abbr ? `${timePart} ${abbr}` : timePart };
}
