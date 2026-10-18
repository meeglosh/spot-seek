/**
 * GET /api/events/:id applies the feed's private-location masking, and the
 * occurrences `max` param is parsed safely.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const TS = Date.now();
const SOON = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function signUp(tag: string) {
  const email = `detail-${tag}-${TS}@spotseek.test`;
  const password = 'Detail_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: `Detail ${tag}` }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

const json = (cookie: string) => ({ 'Content-Type': 'application/json', Cookie: cookie });

let host = '';
let attendee = '';
let stranger = '';
let privateId = '';
let publicId = '';

async function getEvent(id: string, cookie?: string) {
  const res = await SELF.fetch(`${EVENTS}/${id}`, cookie ? { headers: { Cookie: cookie } } : undefined);
  expect(res.status).toBe(200);
  return ((await res.json()) as { event: Record<string, any> }).event;
}

beforeAll(async () => {
  host = await signUp('host');
  attendee = await signUp('att');
  stranger = await signUp('str');

  const make = async (fields: Record<string, unknown>) => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: json(host),
      body: JSON.stringify({ broadcastSubject: 'Cup', startsAt: SOON(), ...fields }),
    });
    const { event } = (await res.json()) as { event: { id: string } };
    await SELF.fetch(`${EVENTS}/${event.id}`, {
      method: 'PATCH',
      headers: json(host),
      body: JSON.stringify({ status: 'published' }),
    });
    return event.id;
  };
  privateId = await make({
    title: `Private Detail ${TS}`,
    venueName: 'The Hideout',
    venueAddress: '99 Secret Rd',
    venueLat: 51.5,
    venueLng: -0.1,
    isPrivateLocation: true,
  });
  publicId = await make({
    title: `Public Detail ${TS}`,
    venueName: 'The Pub',
    venueAddress: '1 Open St',
    venueLat: 51.6,
    venueLng: -0.2,
  });

  await SELF.fetch(RSVPS, {
    method: 'POST',
    headers: json(attendee),
    body: JSON.stringify({ eventId: privateId }),
  });
});

describe('GET /api/events/:id private-location masking', () => {
  it('masks address and coordinates for anonymous callers, keeps venue name', async () => {
    const ev = await getEvent(privateId);
    expect(ev.venueName).toBe('The Hideout');
    expect(ev.venueAddress).toBeNull();
    expect(ev.venueLat).toBeNull();
    expect(ev.venueLng).toBeNull();
  });

  it('masks for a signed-in non-attendee', async () => {
    const ev = await getEvent(privateId, stranger);
    expect(ev.venueAddress).toBeNull();
    expect(ev.venueLat).toBeNull();
    expect(ev.venueLng).toBeNull();
  });

  it('reveals the exact address to the host', async () => {
    const ev = await getEvent(privateId, host);
    expect(ev.venueAddress).toBe('99 Secret Rd');
    expect(ev.venueLat).toBe(51.5);
    expect(ev.venueLng).toBe(-0.1);
  });

  it('reveals the exact address to a going attendee', async () => {
    const ev = await getEvent(privateId, attendee);
    expect(ev.venueAddress).toBe('99 Secret Rd');
    expect(ev.venueLat).toBe(51.5);
  });

  it('never masks a non-private event', async () => {
    const ev = await getEvent(publicId);
    expect(ev.venueAddress).toBe('1 Open St');
    expect(ev.venueLat).toBe(51.6);
  });
});

describe('GET /api/events/:id/occurrences max param', () => {
  let recurringId = '';
  beforeAll(async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: json(host),
      body: JSON.stringify({
        title: `Daily ${TS}`,
        broadcastSubject: 'NFL',
        startsAt: '2026-09-07T20:00:00Z',
        recurrenceRule: 'FREQ=DAILY',
      }),
    });
    recurringId = ((await res.json()) as { event: { id: string } }).event.id;
  });

  async function count(max: string) {
    const res = await SELF.fetch(`${EVENTS}/${recurringId}/occurrences?max=${max}`, {
      headers: { Cookie: host },
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { occurrences: string[] }).occurrences.length;
  }

  it('non-numeric max falls back to the default cap', async () => {
    expect(await count('abc')).toBe(52);
  });
  it('negative, zero and fractional max fall back to the default cap', async () => {
    expect(await count('-5')).toBe(52);
    expect(await count('0')).toBe(52);
    expect(await count('2.5')).toBe(52);
  });
  it('valid max is honoured and the upper cap holds', async () => {
    expect(await count('10')).toBe(10);
    expect(await count('100000')).toBe(365);
  });
});
