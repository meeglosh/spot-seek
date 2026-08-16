/**
 * Sponsor info surfaced on event/feed payloads (no schema changes — serialization only).
 * Covers: GET /api/events/:id `sponsors` (active only, amount desc, 0/1/2 actives),
 * and GET /api/feed `sponsorCount`/`topSponsor` batching.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const FEED = 'https://example.com/api/feed';
const SPONSORS = 'https://example.com/api/sponsors';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `sser-${suffix}-${TS}@spotseek.test`;
  const pw = 'Sp_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = await sess.json() as { user: { id: string } };
  return { cookie, id: user.id };
}

async function registerSponsor(cookie: string, companyName: string) {
  await SELF.fetch(`${SPONSORS}/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ companyName }),
  });
}

async function bidAndResolve(
  sponsorCookie: string,
  hostCookie: string,
  eventId: string,
  amountCents: number,
  finalStatus: 'active' | 'rejected' | null,
) {
  const res = await SELF.fetch(`${SPONSORS}/bids`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsorCookie },
    body: JSON.stringify({ eventId, amountCents }),
  });
  const { bid } = await res.json() as { bid: { id: string } };
  if (finalStatus) {
    await SELF.fetch(`${SPONSORS}/bids/${bid.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({ status: finalStatus }),
    });
  }
  return bid.id;
}

let host: { cookie: string; id: string };
let sponsorA: { cookie: string; id: string };
let sponsorB: { cookie: string; id: string };

beforeAll(async () => {
  [host, sponsorA, sponsorB] = await Promise.all([
    signIn('host'), signIn('spa'), signIn('spb'),
  ]);
  await Promise.all([
    registerSponsor(sponsorA.cookie, `Acme ${TS}`),
    registerSponsor(sponsorB.cookie, `Zenith ${TS}`),
  ]);
});

async function createPublishedEvent(title: string) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
    body: JSON.stringify({ title, broadcastSubject: 'Match', status: 'published' }),
  });
  const { event } = await res.json() as { event: { id: string } };
  return event.id;
}

describe('event detail sponsors serialization', () => {
  it('returns an empty array when there are no sponsorships', async () => {
    const eventId = await createPublishedEvent(`No Sponsors ${TS}`);
    const res = await SELF.fetch(`${EVENTS}/${eventId}`);
    expect(res.status).toBe(200);
    const { event } = await res.json() as { event: { sponsors: unknown[] } };
    expect(event.sponsors).toEqual([]);
  });

  it('returns a single active sponsor, excludes pending/rejected', async () => {
    const eventId = await createPublishedEvent(`One Sponsor ${TS}`);
    await bidAndResolve(sponsorA.cookie, host.cookie, eventId, 5000, 'active');
    await bidAndResolve(sponsorB.cookie, host.cookie, eventId, 9000, 'rejected');
    // Also leave a pending one from sponsorA (second event context not needed;
    // create a fresh pending bid that stays pending).
    await bidAndResolve(sponsorB.cookie, host.cookie, eventId, 1000, null);

    const res = await SELF.fetch(`${EVENTS}/${eventId}`);
    const { event } = await res.json() as { event: { sponsors: Array<{ companyName: string }> } };
    expect(event.sponsors.length).toBe(1);
    expect(event.sponsors[0].companyName).toBe(`Acme ${TS}`);
  });

  it('returns two active sponsors ordered by amount desc', async () => {
    const eventId = await createPublishedEvent(`Two Sponsors ${TS}`);
    await bidAndResolve(sponsorA.cookie, host.cookie, eventId, 3000, 'active');
    await bidAndResolve(sponsorB.cookie, host.cookie, eventId, 8000, 'active');

    const res = await SELF.fetch(`${EVENTS}/${eventId}`);
    const { event } = await res.json() as { event: { sponsors: Array<{ companyName: string }> } };
    expect(event.sponsors.length).toBe(2);
    expect(event.sponsors[0].companyName).toBe(`Zenith ${TS}`);
    expect(event.sponsors[1].companyName).toBe(`Acme ${TS}`);
  });
});

describe('feed sponsorCount / topSponsor', () => {
  it('items without sponsors get sponsorCount 0 and topSponsor null', async () => {
    const title = `Feed No Sponsor ${TS}`;
    const eventId = await createPublishedEvent(title);
    const res = await SELF.fetch(FEED);
    const { events } = await res.json() as {
      events: Array<{ id: string; sponsorCount: number; topSponsor: string | null }>;
    };
    const found = events.find((e) => e.id === eventId);
    expect(found).toBeDefined();
    expect(found?.sponsorCount).toBe(0);
    expect(found?.topSponsor).toBeNull();
  });

  it('reports correct sponsorCount and topSponsor for events with active sponsors', async () => {
    const eventId = await createPublishedEvent(`Feed Two Sponsors ${TS}`);
    await bidAndResolve(sponsorA.cookie, host.cookie, eventId, 4000, 'active');
    await bidAndResolve(sponsorB.cookie, host.cookie, eventId, 12000, 'active');
    // Pending bid should not count.
    await bidAndResolve(sponsorA.cookie, host.cookie, eventId, 500, null);

    const res = await SELF.fetch(FEED);
    const { events } = await res.json() as {
      events: Array<{ id: string; sponsorCount: number; topSponsor: string | null }>;
    };
    const found = events.find((e) => e.id === eventId);
    expect(found).toBeDefined();
    expect(found?.sponsorCount).toBe(2);
    expect(found?.topSponsor).toBe(`Zenith ${TS}`);
  });
});
