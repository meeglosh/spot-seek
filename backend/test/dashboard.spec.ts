import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const DASHBOARD = 'https://example.com/api/dashboard';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `dash-${suffix}-${TS}@spotseek.test`;
  const pw = 'Dash_Pwd_1!';
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
let att2Cookie: string;

beforeAll(async () => {
  [hostCookie, att1Cookie, att2Cookie] = await Promise.all([
    signIn('host'), signIn('att1'), signIn('att2'),
  ]);
});

describe('host dashboard', () => {
  it('returns 401 without auth', async () => {
    const res = await SELF.fetch(DASHBOARD);
    expect(res.status).toBe(401);
  });

  it('returns host events with RSVP counts', async () => {
    // Create 2 events.
    const [e1, e2] = await Promise.all([
      SELF.fetch(EVENTS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
        body: JSON.stringify({ title: 'Event A', broadcastSubject: 'Game A', status: 'published' }) })
        .then(r => r.json() as Promise<{ event: { id: string } }>),
      SELF.fetch(EVENTS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
        body: JSON.stringify({ title: 'Event B', broadcastSubject: 'Game B', status: 'published' }) })
        .then(r => r.json() as Promise<{ event: { id: string } }>),
    ]);

    // 2 attendees RSVP to event A, 1 to event B.
    await SELF.fetch(RSVPS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: att1Cookie },
      body: JSON.stringify({ eventId: e1.event.id }) });
    await SELF.fetch(RSVPS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: att2Cookie },
      body: JSON.stringify({ eventId: e1.event.id }) });
    await SELF.fetch(RSVPS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: att1Cookie },
      body: JSON.stringify({ eventId: e2.event.id }) });

    const res = await SELF.fetch(DASHBOARD, { headers: { Cookie: hostCookie } });
    expect(res.status).toBe(200);
    const { events } = await res.json() as {
      events: Array<{ id: string; rsvpCounts: Record<string, number> }>
    };

    const a = events.find((e) => e.id === e1.event.id);
    const b = events.find((e) => e.id === e2.event.id);
    expect(a?.rsvpCounts.going).toBe(2);
    expect(b?.rsvpCounts.going).toBe(1);
  });

  it('does not include other hosts events', async () => {
    const otherCookie = await signIn('other');
    await SELF.fetch(EVENTS, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: otherCookie },
      body: JSON.stringify({ title: 'Other Event', broadcastSubject: 'Other' }) });

    const res = await SELF.fetch(DASHBOARD, { headers: { Cookie: hostCookie } });
    const { events } = await res.json() as { events: Array<{ title: string }> };
    expect(events.every((e) => e.title !== 'Other Event')).toBe(true);
  });
});
