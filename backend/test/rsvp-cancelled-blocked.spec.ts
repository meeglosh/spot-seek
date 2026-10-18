/**
 * Cancelled events take no joins on any path (API POST/PATCH, guest web RSVP +
 * confirm, guest claim, waitlist promotion), while leaving stays allowed; and
 * waitlist promotion skips users the host blocked after they joined the list.
 * Timestamp-unique fixtures (shared dev DB).
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import { claimGuestRsvp, newToken } from '../src/guests';
import { promoteFromWaitlist } from '../src/waitlist';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const EVENTS = `${BASE}/api/events`;
const RSVPS = `${BASE}/api/rsvps`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const PW = 'Cancelled_Blocked_1!';
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

const db = drizzle(neon(env.DATABASE_URL), { schema });
const sqlRaw = neon(env.DATABASE_URL);

interface U { id: string; email: string; cookie: string }

async function signUp(suffix: string): Promise<U> {
  const email = `cxl-${suffix}-${TS}@spotseek.test`;
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
    body: JSON.stringify({ title: `Cxl ${TS}`, broadcastSubject: 'Game', status: 'published', startsAt: iso(48 * HOUR), ...extra }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

const post = (u: U, eventId: string) =>
  SELF.fetch(RSVPS, { method: 'POST', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ eventId }) });
const patch = (u: U, id: string, state: string) =>
  SELF.fetch(`${RSVPS}/${id}`, { method: 'PATCH', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ state }) });
const cancelEvent = (eventId: string) => sqlRaw`UPDATE events SET status = 'cancelled' WHERE id = ${eventId}`;
const rsvpState = async (id: string) =>
  (await db.select().from(schema.rsvps).where(eq(schema.rsvps.id, id)))[0]?.state;
async function joined(u: U, eventId: string, then?: string) {
  const r = (await (await post(u, eventId)).json()) as { rsvp: { id: string; state: string } };
  if (then) expect((await patch(u, r.rsvp.id, then)).status).toBe(200);
  return r.rsvp.id;
}

let ip = 0;
const guestPost = (eventId: string, email: string) =>
  SELF.fetch(`${BASE}/rsvp/${eventId}`, {
    method: 'POST',
    headers: { ...json, 'cf-connecting-ip': `10.${(TS + 3) % 250}.9.${ip++ & 255}` },
    body: JSON.stringify({ name: 'Gus', email }),
  });
const guest = (eventId: string, email: string, state: schema.GuestRsvpState) =>
  db.insert(schema.guestRsvps).values({ eventId, name: 'Gus', email, state, token: newToken() }).returning().then((r) => r[0]);

describe('cancelled events refuse every join path', () => {
  it('POST /api/rsvps -> 409 event_cancelled and writes nothing', async () => {
    const [host, u] = await Promise.all([signUp('p-host'), signUp('p-u')]);
    const ev = await createEvent(host);
    await cancelEvent(ev.id);
    const res = await post(u, ev.id);
    expect([res.status, await res.json()]).toEqual([409, { error: 'event_cancelled' }]);
    expect(await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, ev.id))).toHaveLength(0);
  }, 60_000);

  it('PATCH to going/waitlisted -> 409, but cancelling and leaving still work', async () => {
    const [host, u, v] = await Promise.all([signUp('t-host'), signUp('t-u'), signUp('t-v')]);
    const ev = await createEvent(host);
    const uid = await joined(u, ev.id, 'cancelled');
    const vid = await joined(v, ev.id); // going
    await cancelEvent(ev.id);

    for (const state of ['going', 'waitlisted']) {
      const res = await patch(u, uid, state);
      expect([res.status, await res.json()]).toEqual([409, { error: 'event_cancelled' }]);
    }
    expect(await rsvpState(uid)).toBe('cancelled');

    expect((await patch(v, vid, 'interested')).status).toBe(200); // leave going
    expect((await patch(v, vid, 'cancelled')).status).toBe(200);
    expect(await rsvpState(vid)).toBe('cancelled');
  }, 60_000);

  it('guest web RSVP and its confirm are refused with cancelled copy', async () => {
    const host = await signUp('g-host');
    const ev = await createEvent(host);
    const pending = await guest(ev.id, `cxl-pending-${TS}@spotseek.test`, 'pending');
    await cancelEvent(ev.id);

    const newEmail = `cxl-new-${TS}@spotseek.test`;
    const res = await guestPost(ev.id, newEmail);
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('This event has been cancelled.');
    expect(await sqlRaw`SELECT 1 FROM guest_rsvps WHERE event_id = ${ev.id} AND email = ${newEmail}`).toHaveLength(0);

    const conf = await SELF.fetch(`${BASE}/rsvp/${ev.id}/${pending.token}/confirm`);
    expect(conf.status).toBe(410);
    expect(await conf.text()).toContain('This event has been cancelled.');
    const [row] = await db.select().from(schema.guestRsvps).where(eq(schema.guestRsvps.id, pending.id));
    expect(row.state).toBe('pending');
  }, 60_000);

  it('claimGuestRsvp and POST /api/rsvps/claim -> event_cancelled, row stays unclaimed', async () => {
    const [host, u] = await Promise.all([signUp('c-host'), signUp('c-u')]);
    const ev = await createEvent(host);
    const g = await guest(ev.id, `cxl-claim-${TS}@spotseek.test`, 'going');
    await cancelEvent(ev.id);

    const r = await claimGuestRsvp(db, u.id, g);
    expect(r.ok ? 'ok' : r.error).toBe('event_cancelled');
    const res = await SELF.fetch(`${RSVPS}/claim`, {
      method: 'POST', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ eventId: ev.id, token: g.token }),
    });
    expect([res.status, await res.json()]).toEqual([409, { error: 'event_cancelled' }]);
    const [row] = await db.select().from(schema.guestRsvps).where(eq(schema.guestRsvps.id, g.id));
    expect(row.claimedUserId).toBeNull();
    expect(await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, ev.id))).toHaveLength(0);
  }, 60_000);

  it('records how a draft event treats POST /api/rsvps (report only)', async () => {
    const [host, u] = await Promise.all([signUp('d-host'), signUp('d-u')]);
    const ev = await createEvent(host, { status: 'draft' });
    const res = await post(u, ev.id);
    console.log(`[draft probe] POST /api/rsvps on a draft event -> ${res.status} ${await res.text()}`);
    expect(res.status).toBeGreaterThan(0);
  }, 60_000);
});

describe('waitlist promotion', () => {
  it('does nothing on a cancelled event', async () => {
    const [host, a, b] = await Promise.all([signUp('wc-host'), signUp('wc-a'), signUp('wc-b')]);
    const ev = await createEvent(host, { capacity: 1 });
    const aid = await joined(a, ev.id);
    const bid = await joined(b, ev.id);
    expect(await rsvpState(bid)).toBe('waitlisted');
    await cancelEvent(ev.id);

    expect((await patch(a, aid, 'cancelled')).status).toBe(200); // spot freed
    expect(await promoteFromWaitlist(db, undefined, ev.id)).toEqual([]);
    expect(await rsvpState(bid)).toBe('waitlisted');
  }, 60_000);

  it('skips a user the host blocked after they joined the list and promotes the next one', async () => {
    const [host, a, b, c] = await Promise.all([signUp('wb-host'), signUp('wb-a'), signUp('wb-b'), signUp('wb-c')]);
    const ev = await createEvent(host, { capacity: 1 });
    const aid = await joined(a, ev.id);
    const bid = await joined(b, ev.id); // first in line
    await new Promise((r) => setTimeout(r, 20));
    const cid = await joined(c, ev.id);
    expect([await rsvpState(bid), await rsvpState(cid)]).toEqual(['waitlisted', 'waitlisted']);
    await sqlRaw`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${host.id}, ${b.id})`;

    expect((await patch(a, aid, 'cancelled')).status).toBe(200);
    expect(await rsvpState(cid)).toBe('going');
    expect(await rsvpState(bid)).toBe('waitlisted'); // row kept, not promoted, not deleted

    // Unblocked, b is eligible again.
    await sqlRaw`DELETE FROM user_blocks WHERE blocker_id = ${host.id} AND blocked_id = ${b.id}`;
    await sqlRaw`UPDATE events SET capacity = 2 WHERE id = ${ev.id}`;
    expect(await promoteFromWaitlist(db, undefined, ev.id)).toEqual([b.id]);
  }, 90_000);
});
