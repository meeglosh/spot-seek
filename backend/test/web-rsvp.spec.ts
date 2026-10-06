/**
 * Web guest RSVP + public event page tests. Timestamp-unique fixtures (shared
 * dev DB). Requests go through worker.fetch with a RESEND_API_KEY so the
 * outbound Resend call happens (and is captured); every non-Resend fetch
 * (the Neon HTTP driver) passes through to the real network.
 */
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import worker from '../src/index';

const BASE = 'https://example.com';
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();

interface SentEmail { to: string; subject: string; html: string; text: string }
let sent: SentEmail[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(String(init?.body)) as SentEmail);
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  });
});
afterEach(() => vi.unstubAllGlobals());

function app(path: string, init: RequestInit = {}, overrides: Record<string, unknown> = {}) {
  const ctx = createExecutionContext();
  return worker.fetch(
    new Request(`${BASE}${path}`, init),
    { ...env, RESEND_API_KEY: 'test-resend-key', ...overrides } as unknown as Env,
    ctx,
  ) as Promise<Response>;
}

let ipCounter = 0;
const freshIp = () => `10.${TS % 250}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

async function signUp(suffix: string, email?: string): Promise<{ cookie: string; email: string }> {
  const e = email ?? `wr-${suffix}-${TS}@spotseek.test`;
  const password = 'WebRsvp_Pass_1!';
  await app('/api/auth/sign-up/email', { method: 'POST', headers: json, body: JSON.stringify({ email: e, password, name: suffix }) });
  const res = await app('/api/auth/sign-in/email', { method: 'POST', headers: json, body: JSON.stringify({ email: e, password }) });
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], email: e };
}

async function createEvent(cookie: string, extra: Record<string, unknown> = {}) {
  const res = await app('/api/events', {
    method: 'POST', headers: { ...json, Cookie: cookie },
    body: JSON.stringify({
      title: `Web RSVP ${TS}`, broadcastSubject: 'Game', status: 'published',
      startsAt: new Date(Date.now() + 3600_000).toISOString(), ...extra,
    }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

function guestPost(eventId: string, body: Record<string, unknown>, ip = freshIp()) {
  return app(`/rsvp/${eventId}`, {
    method: 'POST', headers: { ...json, 'cf-connecting-ip': ip }, body: JSON.stringify(body),
  });
}

const tokenFrom = (email: SentEmail, eventId: string): string => {
  const m = email.html.match(new RegExp(`/rsvp/${eventId}/([0-9a-f]{48})/confirm`));
  expect(m).not.toBeNull();
  return m![1];
};

/** Guest RSVP + confirm; returns the token and the confirm page HTML. */
async function guestJoin(eventId: string, name: string, email: string) {
  const res = await guestPost(eventId, { name, email });
  expect(res.status).toBe(202);
  const mail = sent.filter((m) => m.to === email).at(-1)!;
  const token = tokenFrom(mail, eventId);
  const page = await (await app(`/rsvp/${eventId}/${token}/confirm`)).text();
  return { token, page };
}

const dashboard = async (cookie: string) =>
  (await (await app('/api/dashboard', { headers: { Cookie: cookie } })).json()) as {
    events: { id: string; rsvpCounts: Record<string, number>; guestAttendees: { name: string; state: string }[] }[];
  };
const countsFor = async (cookie: string, eventId: string) =>
  (await dashboard(cookie)).events.find((e) => e.id === eventId)!;

let host: string;
let userA: { cookie: string; email: string };
beforeAll(async () => {
  [host, userA] = await Promise.all([signUp('host').then((s) => s.cookie), signUp('usera')]);
}, 60_000);

describe('guest RSVP flow', () => {
  it('creates a PENDING record and emails a CONFIRM YOUR SPOT link', async () => {
    const ev = await createEvent(host);
    const email = `g-pending-${TS}@spotseek.test`;
    const res = await guestPost(ev.id, { name: 'Pat Pending', email });
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].html).toContain('CONFIRM YOUR SPOT');
    expect(sent[0].html).toContain(`/rsvp/${ev.id}/`);
    const token = tokenFrom(sent[0], ev.id);

    // Pending: manage page says so, and the host count does NOT include it.
    const manage = await (await app(`/rsvp/${ev.id}/${token}`)).text();
    expect(manage).toContain('ALMOST THERE');
    const row = await countsFor(host, ev.id);
    expect(row.rsvpCounts.going).toBe(0);
    expect(row.guestAttendees).toHaveLength(0);
  });

  it('confirming makes it going, shows calendar + install CTAs, and the host sees name only', async () => {
    const ev = await createEvent(host);
    const email = `g-going-${TS}@spotseek.test`;
    const { page } = await guestJoin(ev.id, 'Gale Going', email);
    expect(page).toContain('YOU&#39;RE GOING');
    expect(page).toContain(`/rsvp/${ev.id}/event.ics`);
    expect(page).toContain('COMING SOON'); // App Store placeholder, unchanged
    expect(page).not.toContain(email);

    const res = await app('/api/dashboard', { headers: { Cookie: host } });
    const text = await res.text();
    expect(text).not.toContain(email);
    const row = (JSON.parse(text) as Awaited<ReturnType<typeof dashboard>>).events.find((e) => e.id === ev.id)!;
    expect(row.rsvpCounts.going).toBe(1);
    expect(row.guestAttendees).toEqual([{ name: 'Gale Going', state: 'going' }]);
    expect(Object.keys(row.guestAttendees[0]).sort()).toEqual(['name', 'state']);

    // Public page shows the social proof count.
    const pub = await (await app(`/e/${ev.id}`)).text();
    expect(pub).toContain('1 GOING');
  });

  it('respects capacity (guests count) and waitlists a guest when full', async () => {
    const ev = await createEvent(host, { capacity: 1 });
    // A real user takes the only spot...
    const rs = await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: userA.cookie }, body: JSON.stringify({ eventId: ev.id }) });
    expect(((await rs.json()) as { rsvp: { state: string } }).rsvp.state).toBe('going');
    // ...so a confirmed guest is waitlisted.
    const { page } = await guestJoin(ev.id, 'Wanda Wait', `g-wait-${TS}@spotseek.test`);
    expect(page).toContain('WAITLIST');
    const row = await countsFor(host, ev.id);
    expect(row.rsvpCounts.going).toBe(1);
    expect(row.rsvpCounts.waitlisted).toBe(1);

    // Reverse: a guest holds the only spot, so an account RSVP is waitlisted.
    const ev2 = await createEvent(host, { capacity: 1 });
    const g = await guestJoin(ev2.id, 'Gus First', `g-first-${TS}@spotseek.test`);
    expect(g.page).toContain('YOU&#39;RE GOING');
    const user2 = await signUp('userb');
    const rs2 = await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: user2.cookie }, body: JSON.stringify({ eventId: ev2.id }) });
    expect(((await rs2.json()) as { rsvp: { state: string } }).rsvp.state).toBe('waitlisted');
  }, 60_000);

  it('promotes a waitlisted guest (and emails them) when a going member cancels', async () => {
    const ev = await createEvent(host, { capacity: 1 });
    const user = await signUp('promo');
    const rs = await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: user.cookie }, body: JSON.stringify({ eventId: ev.id }) });
    const rsvpId = ((await rs.json()) as { rsvp: { id: string } }).rsvp.id;
    const guestEmail = `g-promo-${TS}@spotseek.test`;
    const { token, page } = await guestJoin(ev.id, 'Paula Promo', guestEmail);
    expect(page).toContain('WAITLIST');
    sent = [];

    const patch = await app(`/api/rsvps/${rsvpId}`, { method: 'PATCH', headers: { ...json, Cookie: user.cookie }, body: JSON.stringify({ state: 'cancelled' }) });
    expect(patch.status).toBe(200);
    const mail = sent.find((m) => m.to === guestEmail);
    expect(mail).toBeDefined();
    expect(mail!.subject).toContain("You're in!");
    expect(mail!.html).toContain('YOU&#39;RE IN!');
    expect((await (await app(`/rsvp/${ev.id}/${token}`)).text())).toContain('YOU&#39;RE GOING');
    expect((await countsFor(host, ev.id)).rsvpCounts.going).toBe(1);
  }, 60_000);

  it('guest cancel link frees the spot and promotes the next waitlisted guest', async () => {
    const ev = await createEvent(host, { capacity: 1 });
    const a = await guestJoin(ev.id, 'Ann First', `g-a-${TS}@spotseek.test`);
    expect(a.page).toContain('YOU&#39;RE GOING');
    const bEmail = `g-b-${TS}@spotseek.test`;
    const b = await guestJoin(ev.id, 'Ben Second', bEmail);
    expect(b.page).toContain('WAITLIST');
    sent = [];

    const cancel = await app(`/rsvp/${ev.id}/${a.token}/cancel`, { method: 'POST' });
    expect(cancel.status).toBe(200);
    expect(await cancel.text()).toContain('RSVP CANCELLED');
    expect(sent.some((m) => m.to === bEmail && m.subject.includes("You're in!"))).toBe(true);
    expect((await (await app(`/rsvp/${ev.id}/${b.token}`)).text())).toContain('YOU&#39;RE GOING');
    const row = await countsFor(host, ev.id);
    expect(row.rsvpCounts.going).toBe(1);
    expect(row.rsvpCounts.cancelled).toBe(1);
  }, 60_000);

  it('is idempotent on duplicate email: one row, confirmation resent', async () => {
    const ev = await createEvent(host);
    const email = `g-dupe-${TS}@spotseek.test`;
    expect((await guestPost(ev.id, { name: 'Dee Dupe', email })).status).toBe(202);
    expect((await guestPost(ev.id, { name: 'Dee Dupe', email: email.toUpperCase() })).status).toBe(202);
    expect(sent).toHaveLength(2);
    expect(tokenFrom(sent[0], ev.id)).toBe(tokenFrom(sent[1], ev.id));
    const rows = await neon(env.DATABASE_URL)`SELECT COUNT(*)::int AS n FROM guest_rsvps WHERE event_id = ${ev.id}`;
    expect(rows[0].n).toBe(1);
  });

  it('rejects the honeypot (no row, no email)', async () => {
    const ev = await createEvent(host);
    const res = await guestPost(ev.id, { name: 'Bot', email: `g-bot-${TS}@spotseek.test`, website: 'http://spam.example' });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
    const rows = await neon(env.DATABASE_URL)`SELECT COUNT(*)::int AS n FROM guest_rsvps WHERE event_id = ${ev.id}`;
    expect(rows[0].n).toBe(0);
  });

  it('validates input and closed events', async () => {
    const ev = await createEvent(host);
    expect((await guestPost(ev.id, { name: '', email: 'a@b.co' })).status).toBe(400);
    expect((await guestPost(ev.id, { name: 'X', email: 'not-an-email' })).status).toBe(400);
    const draft = await createEvent(host, { status: 'draft' });
    expect((await guestPost(draft.id, { name: 'X', email: `g-draft-${TS}@spotseek.test` })).status).toBe(410);
    expect((await guestPost('00000000-0000-4000-8000-000000000000', { name: 'X', email: 'a@b.co' })).status).toBe(404);
  });

  it('rate limits per IP', async () => {
    const ev = await createEvent(host);
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      // Honeypot-filled so each request is a cheap 400 once past the limiter.
      const r = await guestPost(ev.id, { name: 'Rate', email: 'rate@spotseek.test', website: 'x' }, ip);
      statuses.push(r.status);
      if (r.status === 429) break;
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 400)).toBe(true);
    const other = await guestPost(ev.id, { name: 'Rate', email: 'rate@spotseek.test', website: 'x' }, freshIp());
    expect(other.status).toBe(400);
  }, 60_000);

  it('attaches guest RSVPs to the account when the same email signs up', async () => {
    const ev = await createEvent(host);
    const email = `g-link-${TS}@spotseek.test`;
    await guestJoin(ev.id, 'Lin Linked', email);
    expect((await countsFor(host, ev.id)).rsvpCounts.going).toBe(1);

    const user = await signUp('linked', email);
    const mine = await app('/api/rsvps/mine', { headers: { Cookie: user.cookie } });
    const { rsvps } = (await mine.json()) as { rsvps: { eventId: string; state: string }[] };
    expect(rsvps.find((r) => r.eventId === ev.id)?.state).toBe('going');
    // No double counting: still exactly one going.
    expect((await countsFor(host, ev.id)).rsvpCounts.going).toBe(1);
  }, 60_000);
});

describe('public event page', () => {
  it('has JSON-LD, canonical, og:url, going count, host, sponsor-free layout and the RSVP form', async () => {
    const ev = await createEvent(host, {
      title: `Open Bar </script><b>x ${TS}`, venueName: `Public Bar ${TS}`, venueAddress: '1 Main St', venueLat: 51.5, venueLng: -0.1,
      endsAt: new Date(Date.now() + 7200_000).toISOString(),
    });
    const html = await (await app(`/e/${ev.id}`)).text();
    expect(html).toContain(`<link rel="canonical" href="https://spot-seek-api.dry-base-037d.workers.dev/e/${ev.id}">`);
    expect(html).toContain('property="og:url"');
    expect(html).toContain('0 GOING');
    expect(html).toContain('HOSTED BY');
    expect(html).toContain("I'M GOING");
    expect(html).toContain('name="website"'); // honeypot field
    expect(html).toContain('COMING SOON');

    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain('<');
    const ld = JSON.parse(m![1]);
    expect(ld['@type']).toBe('Event');
    expect(ld.name).toBe(`Open Bar </script><b>x ${TS}`);
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ld.startDate).toBeTruthy();
    expect(ld.endDate).toBeTruthy();
    expect(ld.organizer.name).toBeTruthy();
    expect(ld.location.name).toBe(`Public Bar ${TS}`);
    // Title is HTML-escaped everywhere else.
    expect(html).not.toContain('</script><b>x');
  });

  it('omits the venue everywhere for private-location events', async () => {
    const ev = await createEvent(host, {
      venueName: `Secret Bar ${TS}`, venueAddress: '99 Hidden Lane', venueLat: 51.5, venueLng: -0.1, isPrivateLocation: true,
    });
    const html = await (await app(`/e/${ev.id}`)).text();
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain('Secret Bar');
    expect(html).not.toContain('Hidden Lane');
    expect(html).not.toContain('"location"');
    const ics = await (await app(`/rsvp/${ev.id}/event.ics`)).text();
    expect(ics).not.toContain('Secret Bar');
    expect(ics).not.toContain('LOCATION');
  });

  it('PUBLIC_BASE_URL drives canonical, og:url, robots/sitemap and email links', async () => {
    const ev = await createEvent(host);
    const o = { PUBLIC_BASE_URL: 'https://spotseek.app' };
    const html = await (await app(`/e/${ev.id}`, {}, o)).text();
    expect(html).toContain(`<link rel="canonical" href="https://spotseek.app/e/${ev.id}">`);
    expect(html).toContain(`<meta property="og:url" content="https://spotseek.app/e/${ev.id}">`);
    expect(await (await app('/robots.txt', {}, o)).text()).toContain('Sitemap: https://spotseek.app/sitemap.xml');
    await app(`/rsvp/${ev.id}`, {
      method: 'POST', headers: { ...json, 'cf-connecting-ip': freshIp() },
      body: JSON.stringify({ name: 'Base', email: `g-base-${TS}@spotseek.test` }),
    }, o);
    expect(sent.at(-1)!.html).toContain(`https://spotseek.app/rsvp/${ev.id}/`);
    // Restore the module-level base for later tests.
    await app('/robots.txt');
  });

  it('serves robots.txt', async () => {
    const res = await app('/robots.txt');
    expect(res.status).toBe(200);
    const t = await res.text();
    expect(t).toContain('User-agent: *');
    expect(t).toContain('Disallow: /rsvp/');
    expect(t).toContain('/sitemap.xml');
  });

  it('sitemap lists upcoming public events, excluding private, past and draft', async () => {
    const pub = await createEvent(host, { startsAt: new Date(Date.now() + 60_000).toISOString() });
    const priv = await createEvent(host, { startsAt: new Date(Date.now() + 60_000).toISOString(), isPrivateLocation: true, venueName: 'x' });
    const past = await createEvent(host, { startsAt: new Date(Date.now() - 86_400_000).toISOString() });
    const draft = await createEvent(host, { status: 'draft', startsAt: new Date(Date.now() + 60_000).toISOString() });
    const res = await app('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('xml');
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toContain(`/e/${pub.id}<`);
    expect(xml).not.toContain(priv.id);
    expect(xml).not.toContain(past.id);
    expect(xml).not.toContain(draft.id);
    expect((xml.match(/<url>/g) ?? []).length).toBeLessThanOrEqual(1000);
  });

  it('serves a valid .ics', async () => {
    const ev = await createEvent(host, { venueName: 'Ics Bar, "The" Pub; Ltd', endsAt: new Date(Date.now() + 7200_000).toISOString() });
    const res = await app(`/rsvp/${ev.id}/event.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const ics = await res.text();
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z\r\n/);
    expect(ics).toContain(`UID:${ev.id}@spotseek.app`);
    expect(ics).toContain('LOCATION:Ics Bar\\, "The" Pub\\; Ltd');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect((await app('/rsvp/00000000-0000-4000-8000-000000000000/event.ics')).status).toBe(404);
  });
});
