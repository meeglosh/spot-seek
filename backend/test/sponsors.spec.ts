/**
 * Phase 3: sponsor accounts, auction bidding, offers, analytics.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const SPONSORS = 'https://example.com/api/sponsors';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `sp-${suffix}-${TS}@spotseek.test`;
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

let host: { cookie: string; id: string };
let sponsor: { cookie: string; id: string };
let attendee: { cookie: string; id: string };
let eventId: string;
let bidId: string;

beforeAll(async () => {
  [host, sponsor, attendee] = await Promise.all([
    signIn('host'), signIn('sponsor'), signIn('att'),
  ]);

  // Create and publish an event.
  const eRes = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
    body: JSON.stringify({ title: 'Sponsored Event', broadcastSubject: 'Big Match', status: 'published' }),
  });
  eventId = ((await eRes.json()) as { event: { id: string } }).event.id;

  // Attendee RSVPs.
  await SELF.fetch(RSVPS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
    body: JSON.stringify({ eventId }),
  });
});

describe('3.1 sponsor accounts', () => {
  it('POST /sponsors/register creates sponsor profile', async () => {
    const res = await SELF.fetch(`${SPONSORS}/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
      body: JSON.stringify({ companyName: 'ACME Corp', website: 'https://acme.test' }),
    });
    expect(res.status).toBe(201);
    const { sponsor: s } = await res.json() as { sponsor: { companyName: string } };
    expect(s.companyName).toBe('ACME Corp');
  });

  it('GET /sponsors/me returns own profile', async () => {
    const res = await SELF.fetch(`${SPONSORS}/me`, { headers: { Cookie: sponsor.cookie } });
    expect(res.status).toBe(200);
  });

  it('GET /sponsors/:id returns public profile', async () => {
    const res = await SELF.fetch(`${SPONSORS}/${sponsor.id}`);
    expect(res.status).toBe(200);
  });
});

describe('3.2 auction bidding', () => {
  it('sponsor bids on an event', async () => {
    const res = await SELF.fetch(`${SPONSORS}/bids`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
      body: JSON.stringify({ eventId, amountCents: 10000, note: 'Great event!' }),
    });
    expect(res.status).toBe(201);
    const { bid } = await res.json() as { bid: { id: string; amountCents: number; platformFeeCents: number; status: string } };
    expect(bid.amountCents).toBe(10000);
    expect(bid.platformFeeCents).toBe(1500); // 15%
    expect(bid.status).toBe('pending');
    bidId = bid.id;
  });

  it('non-sponsor cannot bid', async () => {
    const res = await SELF.fetch(`${SPONSORS}/bids`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId, amountCents: 500 }),
    });
    expect(res.status).toBe(403);
  });

  it('host sees bids on their event', async () => {
    const res = await SELF.fetch(`${SPONSORS}/events/${eventId}/bids`, {
      headers: { Cookie: host.cookie },
    });
    expect(res.status).toBe(200);
    const { bids } = await res.json() as { bids: Array<{ id: string }> };
    expect(bids.some((b) => b.id === bidId)).toBe(true);
  });

  it('host accepts a bid (auction resolution)', async () => {
    const res = await SELF.fetch(`${SPONSORS}/bids/${bidId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(200);
    const { bid } = await res.json() as { bid: { status: string } };
    expect(bid.status).toBe('active');
  });
});

describe('3.3 offers/promos', () => {
  it('sponsor attaches a promo to active sponsorship', async () => {
    const res = await SELF.fetch(`${SPONSORS}/bids/${bidId}/offers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
      body: JSON.stringify({ description: '10% off merch', promoCode: 'WATCHPARTY10', discountCents: 1000 }),
    });
    expect(res.status).toBe(201);
    const { offer } = await res.json() as { offer: { promoCode: string } };
    expect(offer.promoCode).toBe('WATCHPARTY10');
  });

  it('attendees can browse offers for the event', async () => {
    const res = await SELF.fetch(`${SPONSORS}/events/${eventId}/offers`, {
      headers: { Cookie: attendee.cookie },
    });
    expect(res.status).toBe(200);
    const { offers } = await res.json() as { offers: Array<{ promoCode: string }> };
    expect(offers.some((o) => o.promoCode === 'WATCHPARTY10')).toBe(true);
  });
});

describe('3.4 analytics', () => {
  it('host sees sponsorship revenue in host analytics', async () => {
    const res = await SELF.fetch(`${SPONSORS}/analytics/host`, {
      headers: { Cookie: host.cookie },
    });
    expect(res.status).toBe(200);
    const { events } = await res.json() as { events: Array<{ id: string; activeSponsorships: number }> };
    const ev = events.find((e) => e.id === eventId);
    expect(ev?.activeSponsorships).toBeGreaterThanOrEqual(1);
  });

  it('sponsor sees their own spend in sponsor analytics', async () => {
    const res = await SELF.fetch(`${SPONSORS}/analytics/me`, {
      headers: { Cookie: sponsor.cookie },
    });
    expect(res.status).toBe(200);
    const { summary } = await res.json() as { summary: { totalSpendCents: number; activeBids: number } };
    expect(summary.activeBids).toBeGreaterThanOrEqual(1);
    expect(summary.totalSpendCents).toBeGreaterThanOrEqual(10000);
  });
});
