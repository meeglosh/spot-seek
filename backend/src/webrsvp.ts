/**
 * Guest (no-account) RSVP from the public event page.
 *
 *   POST /rsvp/:eventId                  name + email (+ honeypot) -> PENDING + confirmation email
 *   GET  /rsvp/:eventId/event.ics        add-to-calendar download
 *   GET  /rsvp/:eventId/:token/confirm   pending -> going | waitlisted (capacity-checked)
 *   GET  /rsvp/:eventId/:token           status / manage page
 *   POST /rsvp/:eventId/:token/cancel    cancel (promotes the waitlist if a going spot frees up)
 *
 * These live under /rsvp/*, not /e/*, because /e/* is claimed by the iOS
 * Universal Link (AASA) and would open the app instead of the web page.
 * Only a CONFIRMED guest RSVP occupies capacity. The guest's email is never
 * rendered to anyone but is only ever mailed to itself.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import { publicBaseUrl } from './email';
import { sendEmail } from './reminders';
import { promoteFromWaitlist } from './waitlist';
import { allowRequest, tooManyRequests, GUEST_RSVP_LIMIT_PER_MIN } from './ratelimit';
import {
  cleanName,
  confirmGuest,
  eventIsOpen,
  isValidEmail,
  newToken,
  normalizeEmail,
} from './guests';
import { escapeHtml, installCtas, renderPage } from './webpage';

export const webRsvpRouter = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/;

const getDb = (c: Ctx) => drizzle(neon(c.env.DATABASE_URL), { schema });

function wantsJson(c: Ctx): boolean {
  return (
    (c.req.header('content-type') ?? '').includes('application/json') ||
    (c.req.header('accept') ?? '').includes('application/json')
  );
}

function messagePage(c: Ctx, status: 400 | 404 | 409 | 410 | 200, headline: string, text: string, eventId?: string) {
  const back = eventId
    ? `<a class="btn btn-ghost" href="${escapeHtml(publicBaseUrl(c.env))}/e/${escapeHtml(eventId)}">BACK TO THE EVENT</a>`
    : '';
  return c.html(
    renderPage({
      title: `${headline} — SpotSeek`,
      noindex: true,
      body: `<div class="content"><h1>${escapeHtml(headline)}</h1><p class="meta">${escapeHtml(text)}</p>${back}</div>`,
    }),
    status,
  );
}

function fail(c: Ctx, status: 400 | 404 | 409 | 410, error: string, eventId?: string) {
  if (wantsJson(c)) return c.json({ error }, status);
  return messagePage(c, status, status === 404 ? 'NOT FOUND' : 'HOLD ON', error, eventId);
}

function formatWhen(event: schema.Event): string {
  if (!event.startsAt) return '';
  return `${event.startsAt.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  })} UTC`;
}

// ─── Create (pending) ─────────────────────────────────────────────────────────

webRsvpRouter.post('/rsvp/:eventId', async (c) => {
  const eventId = c.req.param('eventId');

  // Rate limit per client IP. cf-connecting-ip is always set by Cloudflare at
  // the edge; when absent (local/test harness) there is no IP to key on.
  const ip = c.req.header('cf-connecting-ip');
  if (ip && !(await allowRequest(c.env.GUEST_LIMITER, `guest:${ip}`, GUEST_RSVP_LIMIT_PER_MIN))) {
    return tooManyRequests();
  }

  let name = '';
  let email = '';
  let honeypot = '';
  try {
    if ((c.req.header('content-type') ?? '').includes('application/json')) {
      const b = (await c.req.json()) as Record<string, unknown>;
      name = typeof b.name === 'string' ? b.name : '';
      email = typeof b.email === 'string' ? b.email : '';
      honeypot = typeof b.website === 'string' ? b.website : '';
    } else {
      const b = await c.req.parseBody();
      name = typeof b.name === 'string' ? b.name : '';
      email = typeof b.email === 'string' ? b.email : '';
      honeypot = typeof b.website === 'string' ? b.website : '';
    }
  } catch {
    return fail(c, 400, 'Invalid request body');
  }

  // Honeypot: real users never see or fill this field.
  if (honeypot.trim() !== '') return fail(c, 400, 'Request rejected');

  const cleaned = cleanName(name);
  const normalized = normalizeEmail(email);
  if (!cleaned) return fail(c, 400, 'Please enter your name.', eventId);
  if (!isValidEmail(normalized)) return fail(c, 400, 'Please enter a valid email address.', eventId);

  if (!UUID_RE.test(eventId)) return fail(c, 404, 'Event not found');
  const db = getDb(c);
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return fail(c, 404, 'Event not found');
  if (!eventIsOpen(event)) return fail(c, 410, 'RSVPs are closed for this event.', eventId);

  // Idempotent per (event, email): one row, ever. A repeat submission resends
  // the confirmation link (same token); a cancelled row is revived to pending.
  const rows = await db
    .insert(schema.guestRsvps)
    .values({ eventId, name: cleaned, email: normalized, token: newToken(), state: 'pending' })
    .onConflictDoNothing({ target: [schema.guestRsvps.eventId, schema.guestRsvps.email] })
    .returning();
  let guest = rows[0];
  if (!guest) {
    guest = (await db.query.guestRsvps.findFirst({
      where: and(eq(schema.guestRsvps.eventId, eventId), eq(schema.guestRsvps.email, normalized)),
    }))!;
    if (guest.claimedUserId) {
      // Already attached to an account: tell them to sign in rather than mail a stale link.
      return fail(c, 409, 'You already RSVP\'d with an account. Open the SpotSeek app to manage it.', eventId);
    }
    if (guest.state === 'cancelled') {
      const [revived] = await db
        .update(schema.guestRsvps)
        .set({ state: 'pending', name: cleaned, updatedAt: new Date() })
        .where(and(eq(schema.guestRsvps.id, guest.id), eq(schema.guestRsvps.state, 'cancelled')))
        .returning();
      guest = revived ?? guest;
    }
  }

  await sendConfirmationEmail(c, event, guest);

  if (wantsJson(c)) return c.json({ ok: true, status: 'pending_confirmation' }, 202);
  return c.html(
    renderPage({
      title: 'Check your email — SpotSeek',
      noindex: true,
      body: `<div class="content">
  <div class="label">ONE MORE STEP</div>
  <h1>CHECK YOUR EMAIL</h1>
  <p class="meta">We sent a confirmation link to <strong>${escapeHtml(normalized)}</strong>. Tap it to lock in your spot for <strong>${escapeHtml(event.title)}</strong>. Your spot isn't saved until you confirm.</p>
  <p class="fine">Nothing there? Check spam, or submit the form again to resend it.</p>
  ${installCtas(c.env.APP_STORE_URL, event.id)}
</div>`,
    }),
    202,
  );
});

async function sendConfirmationEmail(c: Ctx, event: schema.Event, guest: schema.GuestRsvp) {
  const base = publicBaseUrl(c.env);
  const confirmUrl = `${base}/rsvp/${event.id}/${guest.token}/confirm`;
  const manageUrl = `${base}/rsvp/${event.id}/${guest.token}`;
  const when = formatWhen(event);
  const title = `Confirm your spot: ${event.title}`;
  const text =
    `Hi ${guest.name},\n\nTap the button to confirm your RSVP for "${event.title}"${when ? ` (${when})` : ''}. ` +
    `Your spot isn't saved until you confirm.\n\nIf you didn't ask for this, ignore this email.`;
  if (!c.env.RESEND_API_KEY) {
    console.log(`[DEV GUEST CONFIRM] to=${guest.email} url=${confirmUrl}`);
    return;
  }
  await sendEmail(guest.email, title, text, c.env.RESEND_API_KEY, {
    type: 'guest_confirm',
    eventId: event.id,
    baseUrl: base,
    ctaUrl: confirmUrl,
    ctaLabel: 'CONFIRM MY SPOT',
    linkUrl: manageUrl,
    linkLabel: 'Manage or cancel my RSVP',
    guest: true,
  });
}

// ─── Add to calendar ──────────────────────────────────────────────────────────

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets (counted conservatively in UTF-8 bytes). */
function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(event: schema.Event, base: string): string {
  const start = event.startsAt!;
  const end = event.endsAt ?? new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SpotSeek//Watch Party//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@spotseek.app`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `URL:${base}/e/${event.id}`,
    `DESCRIPTION:${icsEscape(`${event.broadcastSubject} watch party. Details: ${base}/e/${event.id}`)}`,
  ];
  // Private-location events never put the venue in a public file.
  if (!event.isPrivateLocation) {
    const loc = [event.venueName, event.venueAddress].filter(Boolean).join(', ');
    if (loc) lines.push(`LOCATION:${icsEscape(loc)}`);
  }
  if (event.status === 'cancelled') lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

webRsvpRouter.get('/rsvp/:eventId/event.ics', async (c) => {
  const eventId = c.req.param('eventId');
  if (!UUID_RE.test(eventId)) return c.text('Not found', 404);
  const event = await getDb(c).query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event || event.status === 'draft' || !event.startsAt) return c.text('Not found', 404);
  return c.body(buildIcs(event, publicBaseUrl(c.env)), 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="spotseek-event.ics"',
    'Cache-Control': 'public, max-age=300',
  });
});

// ─── Confirm / status / cancel ────────────────────────────────────────────────

async function loadGuest(c: Ctx) {
  const eventId = c.req.param('eventId') ?? '';
  const token = c.req.param('token') ?? '';
  if (!UUID_RE.test(eventId) || !TOKEN_RE.test(token)) return null;
  const db = getDb(c);
  const guest = await db.query.guestRsvps.findFirst({
    where: and(eq(schema.guestRsvps.token, token), eq(schema.guestRsvps.eventId, eventId)),
  });
  if (!guest) return null;
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return null;
  return { db, guest, event };
}

function statusPage(c: Ctx, event: schema.Event, guest: schema.GuestRsvp) {
  const base = publicBaseUrl(c.env);
  const manage = `${base}/rsvp/${event.id}/${guest.token}`;
  const view = {
    going: { cls: 'status-going', big: "YOU'RE GOING", sub: `Your spot at ${event.title} is locked in.` },
    waitlisted: {
      cls: 'status-wait',
      big: "YOU'RE ON THE WAITLIST",
      sub: "The event is full right now. If a spot opens up we'll email you automatically.",
    },
    pending: { cls: 'status-wait', big: 'ALMOST THERE', sub: 'Confirm your email to lock in your spot.' },
    cancelled: { cls: 'status-off', big: 'RSVP CANCELLED', sub: "You've been removed from this event." },
  }[guest.state];
  const when = formatWhen(event);
  const active = guest.state !== 'cancelled';
  const calendar =
    event.startsAt && active && guest.state !== 'pending'
      ? `<a class="btn" href="${escapeHtml(base)}/rsvp/${escapeHtml(event.id)}/event.ics">ADD TO CALENDAR</a>`
      : '';
  const confirmBtn =
    guest.state === 'pending'
      ? `<a class="btn" href="${escapeHtml(manage)}/confirm">CONFIRM MY SPOT</a>`
      : '';
  const cancel = active
    ? `<form method="post" action="${escapeHtml(manage)}/cancel" style="margin-top:20px"><button class="link-btn" type="submit">Cancel my RSVP</button></form>`
    : '';
  const again =
    guest.state === 'cancelled'
      ? `<a class="btn btn-ghost" href="${escapeHtml(base)}/e/${escapeHtml(event.id)}">RSVP AGAIN</a>`
      : '';
  return c.html(
    renderPage({
      title: `${view.big} — SpotSeek`,
      noindex: true,
      body: `<div class="content">
  <div class="label">${escapeHtml(event.title)}</div>
  <div class="big ${view.cls}">${escapeHtml(view.big)}</div>
  <p class="meta">${escapeHtml(view.sub)}</p>
  ${when ? `<p class="fine">${escapeHtml(when)}</p>` : ''}
  ${confirmBtn}${calendar}${again}
  ${active && guest.state !== 'pending' ? installCtas(c.env.APP_STORE_URL, event.id) : ''}
  ${cancel}
  <p class="fine"><a href="${escapeHtml(base)}/e/${escapeHtml(event.id)}">View the event page</a></p>
</div>`,
    }),
  );
}

webRsvpRouter.get('/rsvp/:eventId/:token/confirm', async (c) => {
  const found = await loadGuest(c);
  if (!found) return messagePage(c, 404, 'LINK NOT FOUND', 'This confirmation link is invalid or has expired.');
  const { db, event } = found;
  let { guest } = found;
  if (guest.state === 'pending') {
    if (!eventIsOpen(event)) {
      return messagePage(c, 410, 'TOO LATE', 'RSVPs are closed for this event.', event.id);
    }
    const state = await confirmGuest(db, c.env.RESEND_API_KEY, event, guest);
    guest = { ...guest, state };
  }
  return statusPage(c, event, guest);
});

webRsvpRouter.get('/rsvp/:eventId/:token', async (c) => {
  const found = await loadGuest(c);
  if (!found) return messagePage(c, 404, 'LINK NOT FOUND', 'This link is invalid or has expired.');
  return statusPage(c, found.event, found.guest);
});

webRsvpRouter.post('/rsvp/:eventId/:token/cancel', async (c) => {
  const found = await loadGuest(c);
  if (!found) return messagePage(c, 404, 'LINK NOT FOUND', 'This link is invalid or has expired.');
  const { db, event } = found;
  let { guest } = found;
  if (guest.state !== 'cancelled') {
    const wasGoing = guest.state === 'going';
    await db
      .update(schema.guestRsvps)
      .set({ state: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.guestRsvps.id, guest.id));
    guest = { ...guest, state: 'cancelled' };
    // A going spot was freed: promote the earliest waitlisted attendee.
    if (wasGoing) {
      await promoteFromWaitlist(db, c.env.RESEND_API_KEY, event.id).catch((err) =>
        console.error('[webrsvp] waitlist promotion failed:', err),
      );
    }
  }
  return statusPage(c, event, guest);
});
