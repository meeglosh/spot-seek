/**
 * RSVP gate parity: PATCH /api/rsvps/:id and the guest-RSVP claim must refuse
 * what POST /api/rsvps refuses (host-blocked, hidden/removed, ended), and
 * concurrent POSTs must not overfill capacity. Timestamp-unique fixtures.
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import { claimGuestRsvp } from '../src/guests';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const EVENTS = `${BASE}/api/events`;
const RSVPS = `${BASE}/api/rsvps`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const PW = 'Rsvp_Checks_123!';
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

const db = drizzle(neon(env.DATABASE_URL), { schema });
const sqlRaw = neon(env.DATABASE_URL);

interface U { id: string; email: string; cookie: string }

async function signUp(suffix: string): Promise<U> {
  const email = `rsvpchk-${suffix}-${TS}@spotseek.test`;
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: PW, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: PW }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = (await sess.json()) as { user: { id: string } };
  return { id: user.id, email, cookie };
}

async function createEvent(host: U, extra: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { ...json, Cookie: host.cookie },
    body: JSON.stringify({ title: `RsvpChk ${TS}`, broadcastSubject: 'Game', status: 'published', startsAt: iso(48 * HOUR), ...extra }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

const post = (u: U, eventId: string) =>
  SELF.fetch(RSVPS, { method: 'POST', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ eventId }) });
const patch = (u: U, id: string, state: string) =>
  SELF.fetch(`${RSVPS}/${id}`, { method: 'PATCH', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ state }) });
const block = (host: U, userId: string) =>
  sqlRaw`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${host.id}, ${userId})`;
const endEvent = (eventId: string) =>
  sqlRaw`UPDATE events SET starts_at = ${iso(-30 * HOUR)}, ends_at = ${iso(-26 * HOUR)} WHERE id = ${eventId}`;

/** RSVP, then move to `then`; returns the rsvp id. */
async function joined(u: U, eventId: string, then: string) {
  const r = (await (await post(u, eventId)).json()) as { rsvp: { id: string } };
  expect((await patch(u, r.rsvp.id, then)).status).toBe(200);
  return r.rsvp.id;
}

describe('PATCH /api/rsvps/:id gates (F34/F36)', () => {
  it('a host-blocked user cannot move back to going or waitlisted, but can still cancel', async () => {
    const [host, u] = await Promise.all([signUp('p-host'), signUp('p-u')]);
    const ev = await createEvent(host);
    const id = await joined(u, ev.id, 'cancelled');
    await block(host, u.id);

    expect((await patch(u, id, 'going')).status).toBe(403);
    expect((await patch(u, id, 'waitlisted')).status).toBe(403);
    const [row] = await db.select().from(schema.rsvps).where(eq(schema.rsvps.id, id));
    expect(row.state).toBe('cancelled');

    // Leaving stays allowed for a blocked user who is currently going.
    await sqlRaw`UPDATE rsvps SET state = 'going' WHERE id = ${id}`;
    expect((await patch(u, id, 'cancelled')).status).toBe(200);
  }, 60_000);

  it('a user on a hidden or removed event cannot rejoin', async () => {
    const [host, u] = await Promise.all([signUp('h-host'), signUp('h-u')]);
    const ev = await createEvent(host);
    const id = await joined(u, ev.id, 'cancelled');
    for (const status of ['hidden', 'removed']) {
      await sqlRaw`UPDATE events SET moderation_status = ${status} WHERE id = ${ev.id}`;
      expect((await patch(u, id, 'going')).status).toBe(404);
      expect((await patch(u, id, 'waitlisted')).status).toBe(404);
    }
    await sqlRaw`UPDATE events SET moderation_status = 'ok' WHERE id = ${ev.id}`;
    expect((await patch(u, id, 'going')).status).toBe(200);
  }, 60_000);

  it('cannot move to waitlisted once the event has ended, but can still cancel', async () => {
    const [host, u] = await Promise.all([signUp('e-host'), signUp('e-u')]);
    const ev = await createEvent(host);
    const id = await joined(u, ev.id, 'interested');
    await endEvent(ev.id);
    expect((await patch(u, id, 'waitlisted')).status).toBe(409);
    expect((await patch(u, id, 'cancelled')).status).toBe(200);
  }, 60_000);
});

describe('claimGuestRsvp gates (F20/F32)', () => {
  const guest = (eventId: string, email: string, state: schema.GuestRsvpState) =>
    db.insert(schema.guestRsvps).values({
      eventId, name: 'Guest', email, state, token: `${TS}-${Math.random().toString(16).slice(2)}`,
    }).returning().then((r) => r[0]);
  const myRsvp = (eventId: string, userId: string) =>
    db.select().from(schema.rsvps).where(and(eq(schema.rsvps.eventId, eventId), eq(schema.rsvps.userId, userId)));
  const guestRow = (id: string) =>
    db.select().from(schema.guestRsvps).where(eq(schema.guestRsvps.id, id)).then((r) => r[0]);

  it('does not claim guest RSVPs for blocked, hidden or ended events, and leaves those rows unclaimed', async () => {
    const [blockingHost, otherHost, u] = await Promise.all([signUp('c-host'), signUp('c-host2'), signUp('c-u')]);
    const [blockedEv, hiddenEv, endedEv, okEv] = await Promise.all([
      createEvent(blockingHost), createEvent(otherHost), createEvent(otherHost), createEvent(otherHost),
    ]);
    await block(blockingHost, u.id);
    await sqlRaw`UPDATE events SET moderation_status = 'hidden' WHERE id = ${hiddenEv.id}`;
    await endEvent(endedEv.id);

    const gBlocked = await guest(blockedEv.id, u.email, 'going');
    const gHidden = await guest(hiddenEv.id, u.email, 'going');
    const gEnded = await guest(endedEv.id, u.email, 'waitlisted');
    const gOk = await guest(okEv.id, u.email, 'going');

    const results = await Promise.all([gBlocked, gHidden, gEnded, gOk].map((g) => claimGuestRsvp(db, u.id, g)));
    expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual(['forbidden', 'not_found', 'event_ended', 'ok']);

    for (const [g, ev] of [[gBlocked, blockedEv], [gHidden, hiddenEv], [gEnded, endedEv]] as const) {
      expect(await myRsvp(ev.id, u.id)).toHaveLength(0);
      expect((await guestRow(g.id)).claimedUserId).toBeNull();
    }
    expect(await myRsvp(okEv.id, u.id)).toHaveLength(1);
    expect((await guestRow(gOk.id)).claimedUserId).toBe(u.id);
  }, 90_000);
});

describe('POST /api/rsvps capacity under concurrency (F35)', () => {
  it('never leaves more going than capacity when RSVPs race', async () => {
    const host = await signUp('cap-host');
    const users = await Promise.all([1, 2, 3, 4, 5].map((i) => signUp(`cap-u${i}`)));
    const ev = await createEvent(host, { capacity: 1 });
    await Promise.all(users.map((u) => post(u, ev.id)));
    const rows = await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, ev.id));
    expect(rows.filter((r) => r.state === 'going').length).toBeLessThanOrEqual(1);
  }, 90_000);
});
