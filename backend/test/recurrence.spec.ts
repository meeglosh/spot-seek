import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseRRule, generateOccurrences } from '../src/recurrence';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';

const TS = Date.now();

async function signIn() {
  const email = `rec-${TS}@spotseek.test`;
  const pw = 'Rec_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: 'RecHost' }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

let cookie: string;

beforeAll(async () => { cookie = await signIn(); });

describe('recurrence parser (unit)', () => {
  it('parses FREQ=WEEKLY', () => {
    const r = parseRRule('FREQ=WEEKLY');
    expect(r.freq).toBe('WEEKLY');
    expect(r.interval).toBe(1);
  });

  it('parses FREQ=DAILY;INTERVAL=2;COUNT=5', () => {
    const r = parseRRule('FREQ=DAILY;INTERVAL=2;COUNT=5');
    expect(r.freq).toBe('DAILY');
    expect(r.interval).toBe(2);
    expect(r.count).toBe(5);
  });

  it('generates correct occurrences for FREQ=WEEKLY;COUNT=3', () => {
    const dtStart = new Date('2026-01-05T19:00:00Z'); // Monday
    const r = parseRRule('FREQ=WEEKLY;COUNT=3');
    const occ = generateOccurrences(dtStart, r);
    expect(occ).toHaveLength(3);
    expect(occ[1].getTime() - occ[0].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('generates daily occurrences with interval', () => {
    const dtStart = new Date('2026-01-01T00:00:00Z');
    const r = parseRRule('FREQ=DAILY;INTERVAL=3;COUNT=4');
    const occ = generateOccurrences(dtStart, r);
    expect(occ).toHaveLength(4);
    expect(occ[1].getTime() - occ[0].getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe('recurring events API', () => {
  it('creates a recurring event with recurrenceRule', async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: 'Sunday Watch Club',
        broadcastSubject: 'Premier League',
        startsAt: '2026-09-06T14:00:00Z',
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=SU;COUNT=10',
      }),
    });
    expect(res.status).toBe(201);
    const { event } = await res.json() as { event: { id: string; recurrenceRule: string } };
    expect(event.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=SU;COUNT=10');
  });

  it('GET /events/:id/occurrences returns dates for a recurring event', async () => {
    const create = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        title: 'Weekly Game Night',
        broadcastSubject: 'NFL',
        startsAt: '2026-09-07T20:00:00Z',
        recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
      }),
    });
    const { event } = await create.json() as { event: { id: string } };

    const res = await SELF.fetch(`${EVENTS}/${event.id}/occurrences`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const { occurrences } = await res.json() as { occurrences: string[] };
    expect(occurrences).toHaveLength(4);
  });

  it('non-recurring event returns empty occurrences', async () => {
    const create = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'One-off', broadcastSubject: 'Cup Final' }),
    });
    const { event } = await create.json() as { event: { id: string } };

    const res = await SELF.fetch(`${EVENTS}/${event.id}/occurrences`, {
      headers: { Cookie: cookie },
    });
    const { occurrences } = await res.json() as { occurrences: string[] };
    expect(occurrences).toHaveLength(0);
  });
});
