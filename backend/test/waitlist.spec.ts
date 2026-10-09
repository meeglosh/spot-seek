/**
 * Waitlist auto-promotion tests. Timestamp-unique fixtures (shared dev DB).
 */
import { SELF, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const EVENTS = `${BASE}/api/events`;
const RSVPS = `${BASE}/api/rsvps`;
const NOTIFS = `${BASE}/api/notifications`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();

async function signUp(suffix: string): Promise<string> {
  const email = `wl-${suffix}-${TS}@spotseek.test`;
  const password = 'Waitlist_Pass_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function createEvent(cookie: string, capacity: number | null, extra: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { ...json, Cookie: cookie },
    body: JSON.stringify({ title: `WL Event ${TS}`, broadcastSubject: 'Game', status: 'published', capacity, ...extra }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

async function rsvp(cookie: string, eventId: string) {
  const res = await SELF.fetch(RSVPS, {
    method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ eventId }),
  });
  return ((await res.json()) as { rsvp: { id: string; state: string } }).rsvp;
}

async function setState(cookie: string, id: string, state: string) {
  return SELF.fetch(`${RSVPS}/${id}`, {
    method: 'PATCH', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ state }),
  });
}

async function mine(cookie: string): Promise<Record<string, string>> {
  const res = await SELF.fetch(`${RSVPS}/mine`, { headers: { Cookie: cookie } });
  const { rsvps } = (await res.json()) as { rsvps: { id: string; eventId: string; state: string }[] };
  return Object.fromEntries(rsvps.map((r) => [r.eventId, r.state]));
}

async function promotedNotifs(cookie: string, eventId: string) {
  const res = await SELF.fetch(NOTIFS, { headers: { Cookie: cookie } });
  const { notifications } = (await res.json()) as { notifications: { type: string; eventId: string; title: string }[] };
  return notifications.filter((n) => n.type === 'waitlist_promoted' && n.eventId === eventId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let host: string;
let u: string[];

beforeAll(async () => {
  [host, ...u] = await Promise.all(['host', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(signUp));
});

describe('waitlist promotion', () => {
  it('promotes the earliest waitlisted user (not a later one) and notifies them', async () => {
    const event = await createEvent(host, 1);
    const going = await rsvp(u[0], event.id);
    expect(going.state).toBe('going');
    // u[2] joins the waitlist first, u[1] second.
    expect((await rsvp(u[2], event.id)).state).toBe('waitlisted');
    await sleep(20);
    expect((await rsvp(u[1], event.id)).state).toBe('waitlisted');

    expect((await setState(u[0], going.id, 'cancelled')).status).toBe(200);

    expect((await mine(u[2]))[event.id]).toBe('going');
    expect((await mine(u[1]))[event.id]).toBe('waitlisted');
    const notifs = await promotedNotifs(u[2], event.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toBe(`You're in! "WL Event ${TS}"`);
    expect(await promotedNotifs(u[1], event.id)).toHaveLength(0);
  });

  it('orders by when the user joined the waitlist, not created_at (rejoin goes to the back)', async () => {
    const event = await createEvent(host, 1);
    const going = await rsvp(u[0], event.id);
    const early = await rsvp(u[1], event.id); // waitlisted first (older created_at)
    await sleep(20);
    await rsvp(u[2], event.id); // waitlisted second
    await sleep(20);
    await setState(u[1], early.id, 'cancelled');
    await setState(u[1], early.id, 'waitlisted'); // rejoins the line at the back
    await setState(u[0], going.id, 'cancelled');
    expect((await mine(u[2]))[event.id]).toBe('going');
    expect((await mine(u[1]))[event.id]).toBe('waitlisted');
  });

  it('does nothing when there is no waitlist', async () => {
    const event = await createEvent(host, 2);
    const a = await rsvp(u[0], event.id);
    await rsvp(u[1], event.id);
    await setState(u[0], a.id, 'cancelled');
    expect((await mine(u[0]))[event.id]).toBe('cancelled');
    expect((await mine(u[1]))[event.id]).toBe('going');
    expect(await promotedNotifs(u[0], event.id)).toHaveLength(0);
    expect(await promotedNotifs(u[1], event.id)).toHaveLength(0);
  });

  it('a capacity increase promotes N users in order', async () => {
    const event = await createEvent(host, 1);
    await rsvp(u[0], event.id);
    const order = [u[3], u[1], u[2]];
    for (const c of order) {
      await rsvp(c, event.id);
      await sleep(20);
    }
    const res = await SELF.fetch(`${EVENTS}/${event.id}`, {
      method: 'PATCH', headers: { ...json, Cookie: host }, body: JSON.stringify({ capacity: 3 }),
    });
    expect(res.status).toBe(200);
    // 1 going + 2 free spots -> first two in line promoted, third still waiting.
    expect((await mine(u[3]))[event.id]).toBe('going');
    expect((await mine(u[1]))[event.id]).toBe('going');
    expect((await mine(u[2]))[event.id]).toBe('waitlisted');
    expect(await promotedNotifs(u[3], event.id)).toHaveLength(1);
    expect(await promotedNotifs(u[1], event.id)).toHaveLength(1);
  });

  it('concurrent cancels never over-fill', async () => {
    const event = await createEvent(host, 3);
    const goers = await Promise.all([u[0], u[1], u[2]].map((c) => rsvp(c, event.id)));
    await Promise.all([u[3], u[4], u[5]].map((c) => rsvp(c, event.id)));
    await Promise.all(goers.map((g, i) => setState(u[i], g.id, 'cancelled')));

    const states = await Promise.all(u.slice(0, 6).map((c) => mine(c)));
    const going = states.filter((s) => s[event.id] === 'going').length;
    expect(going).toBeLessThanOrEqual(3);
    expect(going).toBe(3);
  });

  it('never promotes the host', async () => {
    const event = await createEvent(host, 1);
    const going = await rsvp(u[0], event.id);
    expect((await rsvp(host, event.id)).state).toBe('waitlisted'); // host first in line
    await sleep(20);
    expect((await rsvp(u[1], event.id)).state).toBe('waitlisted');
    await setState(u[0], going.id, 'cancelled');
    expect((await mine(host))[event.id]).toBe('waitlisted');
    expect((await mine(u[1]))[event.id]).toBe('going');
    expect(await promotedNotifs(host, event.id)).toHaveLength(0);
  });

  it('does not promote for a past event', async () => {
    // RSVPs to an already-ended party are rejected, so the party ends after the RSVPs land.
    const event = await createEvent(host, 1);
    const going = await rsvp(u[0], event.id);
    await rsvp(u[1], event.id);
    await neon(env.DATABASE_URL)`UPDATE events SET starts_at = now() - interval '1 day' WHERE id = ${event.id}`;
    await setState(u[0], going.id, 'cancelled');
    expect((await mine(u[1]))[event.id]).toBe('waitlisted');
    expect(await promotedNotifs(u[1], event.id)).toHaveLength(0);
  });

  it('does not promote for a cancelled event', async () => {
    const event = await createEvent(host, 1);
    const going = await rsvp(u[0], event.id);
    await rsvp(u[1], event.id);
    await SELF.fetch(`${EVENTS}/${event.id}`, {
      method: 'PATCH', headers: { ...json, Cookie: host }, body: JSON.stringify({ status: 'cancelled' }),
    });
    await setState(u[0], going.id, 'cancelled');
    expect((await mine(u[1]))[event.id]).toBe('waitlisted');
  });
});
