import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const REMINDERS = 'https://example.com/api/reminders';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `rem-${suffix}-${TS}@spotseek.test`;
  const pw = 'Rem_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

let hostCookie: string;
let att1Cookie: string;
let eventId: string;

beforeAll(async () => {
  [hostCookie, att1Cookie] = await Promise.all([signIn('host'), signIn('att1')]);
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
    body: JSON.stringify({
      title: 'Reminder Test Event',
      broadcastSubject: 'Big Game',
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'published',
    }),
  });
  eventId = ((await res.json()) as { event: { id: string } }).event.id;
  await SELF.fetch(RSVPS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: att1Cookie },
    body: JSON.stringify({ eventId }),
  });
});

describe('reminders scaffolding', () => {
  it('POST /send returns 401 without auth', async () => {
    const res = await SELF.fetch(`${REMINDERS}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    expect(res.status).toBe(401);
  });

  it('non-host gets 403', async () => {
    const res = await SELF.fetch(`${REMINDERS}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: att1Cookie },
      body: JSON.stringify({ eventId }),
    });
    expect(res.status).toBe(403);
  });

  it('host can trigger dev reminders and result includes sent count', async () => {
    const res = await SELF.fetch(`${REMINDERS}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({ eventId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { sent: number; note: string };
    expect(body.sent).toBe(1);
    expect(body.note).toContain('dev-sender-only');
  });
});
