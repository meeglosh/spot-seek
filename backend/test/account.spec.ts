/**
 * Account deletion (DELETE /api/account). Timestamp-unique fixtures — shared
 * dev DB. DB state is asserted directly through drizzle (env.DATABASE_URL).
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, or } from 'drizzle-orm';
import * as schema from '../src/schema';
import * as authSchema from '../src/auth-schema';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const EVENTS = `${BASE}/api/events`;
const RSVPS = `${BASE}/api/rsvps`;
const SPONSORS = `${BASE}/api/sponsors`;
const ACCOUNT = `${BASE}/api/account`;
const NOTIFS = `${BASE}/api/notifications`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const PW = 'Delete_Pass_123!';
const HOUR = 3_600_000;

const db = drizzle(neon(env.DATABASE_URL), { schema });
const authDb = drizzle(neon(env.DATABASE_URL), { schema: authSchema });

interface TestUser { id: string; email: string; cookie: string }

async function signUp(suffix: string): Promise<TestUser> {
  const email = `acctdel-${suffix}-${TS}@spotseek.test`;
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

async function createEvent(u: TestUser, extra: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { ...json, Cookie: u.cookie },
    body: JSON.stringify({ title: `AcctDel Event ${TS}`, broadcastSubject: 'Game', status: 'published', ...extra }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

async function rsvp(u: TestUser, eventId: string, state?: string) {
  const res = await SELF.fetch(RSVPS, {
    method: 'POST', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ eventId }),
  });
  const { rsvp: r } = (await res.json()) as { rsvp: { id: string; state: string } };
  if (state && r.state !== state) {
    await SELF.fetch(`${RSVPS}/${r.id}`, {
      method: 'PATCH', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ state }),
    });
  }
  return r;
}

const del = (u: TestUser | null, body: unknown = { confirm: 'DELETE' }) =>
  SELF.fetch(ACCOUNT, {
    method: 'DELETE',
    headers: { ...json, ...(u ? { Cookie: u.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function canSignIn(u: TestUser, password = PW) {
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email: u.email, password }),
  });
  return res.status === 200;
}

async function userRowsExist(u: TestUser) {
  const app = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  const ba = await authDb.select().from(authSchema.authUser).where(eq(authSchema.authUser.id, u.id));
  return { app: app.length, auth: ba.length };
}

async function sponsorBid(sponsor: TestUser, eventId: string) {
  await SELF.fetch(`${SPONSORS}/register`, {
    method: 'POST', headers: { ...json, Cookie: sponsor.cookie },
    body: JSON.stringify({ companyName: `AcctDel Co ${TS}` }),
  });
  const res = await SELF.fetch(`${SPONSORS}/bids`, {
    method: 'POST', headers: { ...json, Cookie: sponsor.cookie },
    body: JSON.stringify({ eventId, amountCents: 5000 }),
  });
  return ((await res.json()) as { bid: { id: string } }).bid;
}

describe('DELETE /api/account — guards', () => {
  it('requires authentication', async () => {
    expect((await del(null)).status).toBe(401);
  });

  it('requires { confirm: "DELETE" } and deletes nothing otherwise', async () => {
    const u = await signUp('confirm');
    expect((await del(u, {})).status).toBe(400);
    expect((await del(u, { confirm: 'delete' })).status).toBe(400);
    expect((await del(u, { confirm: true })).status).toBe(400);
    expect(await userRowsExist(u)).toEqual({ app: 1, auth: 1 });
    expect(await canSignIn(u)).toBe(true);
  });
});

describe('DELETE /api/account — attendee', () => {
  it('removes user, auth rows, sessions, RSVPs, favourites, follows, notifications, prefs, reviews', async () => {
    const host = await signUp('att-host');
    const other = await signUp('att-other');
    const u = await signUp('att');
    const ev = await createEvent(host, { startsAt: iso(48 * HOUR) });
    const past = await createEvent(host, { startsAt: iso(-26 * HOUR), endsAt: iso(-24 * HOUR), status: 'completed' });
    await rsvp(u, ev.id); // going
    await rsvp(u, past.id);

    await db.insert(schema.userFavourites).values({ userId: u.id, type: 'team', value: `Team ${TS}` });
    await db.insert(schema.follows).values([
      { followerId: u.id, followingId: other.id },
      { followerId: other.id, followingId: u.id },
    ]);
    await db.insert(schema.notificationPrefs).values({ userId: u.id });
    await db.insert(schema.reviews).values({ eventId: past.id, reviewerId: u.id, hostId: host.id, hostRating: 5 });
    await db.insert(schema.comments).values({ eventId: ev.id, userId: u.id, body: 'hi' });
    // Host got an RSVP notification from u's RSVP; give u one of their own too.
    await db.insert(schema.notifications).values({ userId: u.id, type: 'rsvp', title: 't', body: 'b' });

    const res = await del(u);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    expect(await userRowsExist(u)).toEqual({ app: 0, auth: 0 });
    const sessions = await authDb.select().from(authSchema.authSession).where(eq(authSchema.authSession.userId, u.id));
    const accounts = await authDb.select().from(authSchema.authAccount).where(eq(authSchema.authAccount.userId, u.id));
    expect(sessions).toHaveLength(0);
    expect(accounts).toHaveLength(0);
    expect(await db.select().from(schema.rsvps).where(eq(schema.rsvps.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.userFavourites).where(eq(schema.userFavourites.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.follows).where(
      or(eq(schema.follows.followerId, u.id), eq(schema.follows.followingId, u.id)),
    )).toHaveLength(0);
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.reviews).where(eq(schema.reviews.reviewerId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.comments).where(eq(schema.comments.userId, u.id))).toHaveLength(0);

    // Old session is dead, and the credentials no longer work.
    const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: u.cookie } });
    expect(((await sess.json()) as { user?: unknown } | null)?.user ?? null).toBeNull();
    expect(await canSignIn(u)).toBe(false);
    expect((await del(u)).status).toBe(401);

    // Other users untouched.
    expect((await userRowsExist(other)).app).toBe(1);
    expect((await userRowsExist(host)).app).toBe(1);
  });

  it('runs waitlist promotion for events where they were going', async () => {
    const host = await signUp('wl-host');
    const going = await signUp('wl-going');
    const waiter1 = await signUp('wl-w1');
    const waiter2 = await signUp('wl-w2');
    const ev = await createEvent(host, { capacity: 1, startsAt: iso(48 * HOUR) });
    expect((await rsvp(going, ev.id)).state).toBe('going');
    expect((await rsvp(waiter1, ev.id)).state).toBe('waitlisted');
    expect((await rsvp(waiter2, ev.id)).state).toBe('waitlisted');

    expect((await del(going)).status).toBe(200);

    const rows = await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, ev.id));
    const byUser = Object.fromEntries(rows.map((r) => [r.userId, r.state]));
    expect(byUser[going.id]).toBeUndefined();
    expect(byUser[waiter1.id]).toBe('going'); // earliest waitlisted gets the freed spot
    expect(byUser[waiter2.id]).toBe('waitlisted');

    const n = await SELF.fetch(NOTIFS, { headers: { Cookie: waiter1.cookie } });
    const { notifications } = (await n.json()) as { notifications: { type: string; eventId: string }[] };
    expect(notifications.some((x) => x.type === 'waitlist_promoted' && x.eventId === ev.id)).toBe(true);
  });
});

describe('DELETE /api/account — guest RSVPs', () => {
  const guest = (eventId: string, email: string, state: schema.GuestRsvpState, extra: Partial<schema.GuestRsvp> = {}) =>
    db.insert(schema.guestRsvps).values({
      eventId, name: 'Guest', email, state, token: `${TS}-${Math.random().toString(16).slice(2)}-${state}`, ...extra,
    }).returning().then((r) => r[0]);
  const guestRows = (eventId: string) =>
    db.select().from(schema.guestRsvps).where(eq(schema.guestRsvps.eventId, eventId));

  it('promotes a waitlisted GUEST when the going member is deleted (merged waitlist)', async () => {
    const host = await signUp('gw-host');
    const going = await signUp('gw-going');
    const ev = await createEvent(host, { capacity: 1, startsAt: iso(48 * HOUR) });
    expect((await rsvp(going, ev.id)).state).toBe('going');
    const g = await guest(ev.id, `gw-wait-${TS}@spotseek.test`, 'waitlisted');

    expect((await del(going)).status).toBe(200);
    const rows = await guestRows(ev.id);
    expect(rows.find((r) => r.id === g.id)?.state).toBe('going');
  }, 60_000);

  it('deletes unclaimed/pending guest RSVPs with the deleted user email (any case) and frees their spot', async () => {
    const host = await signUp('gd-host');
    const u = await signUp('gd');
    const waiter = await signUp('gd-waiter');
    const ev = await createEvent(host, { capacity: 1, startsAt: iso(48 * HOUR) });
    const ev2 = await createEvent(host, { startsAt: iso(72 * HOUR) });
    // The guest row for u's email holds the only spot on ev; waiter is waitlisted.
    const mine = await guest(ev.id, u.email.toLowerCase(), 'going');
    expect((await rsvp(waiter, ev.id)).state).toBe('waitlisted');
    const pending = await guest(ev2.id, u.email.toLowerCase(), 'pending');
    const bystander = await guest(ev2.id, `gd-other-${TS}@spotseek.test`, 'pending');

    expect((await del(u)).status).toBe(200);

    expect((await guestRows(ev.id)).find((r) => r.id === mine.id)).toBeUndefined();
    expect((await guestRows(ev2.id)).find((r) => r.id === pending.id)).toBeUndefined();
    expect((await guestRows(ev2.id)).find((r) => r.id === bystander.id)).toBeDefined();
    const wr = await db.select().from(schema.rsvps).where(and(eq(schema.rsvps.eventId, ev.id), eq(schema.rsvps.userId, waiter.id)));
    expect(wr[0].state).toBe('going'); // freed guest spot was promoted
  }, 60_000);

  it('deletes guest rows claimed by the user (no phantom unclaimed row) and cascades on their own past events', async () => {
    const host = await signUp('gc-host');
    const u = await signUp('gc');
    const ev = await createEvent(host, { startsAt: iso(48 * HOUR) });
    const claimed = await guest(ev.id, `someone-else-${TS}@spotseek.test`, 'going', { claimedUserId: u.id });
    const past = await createEvent(u, { startsAt: iso(-26 * HOUR), endsAt: iso(-24 * HOUR), status: 'completed' });
    const onPast = await guest(past.id, `gc-past-${TS}@spotseek.test`, 'going');

    expect((await del(u)).status).toBe(200);

    expect((await guestRows(ev.id)).find((r) => r.id === claimed.id)).toBeUndefined();
    expect((await guestRows(past.id)).find((r) => r.id === onPast.id)).toBeUndefined();
    expect(await userRowsExist(u)).toEqual({ app: 0, auth: 0 });
  }, 60_000);
});

describe('DELETE /api/account — host', () => {
  it('409 has_upcoming_events lists the events and deletes nothing; allowed once cancelled', async () => {
    const host = await signUp('up-host');
    const att = await signUp('up-att');
    const ev = await createEvent(host, { title: `Upcoming ${TS}`, startsAt: iso(48 * HOUR) });
    await rsvp(att, ev.id);

    const res = await del(host);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; events: { id: string; title: string }[] };
    expect(body.error).toBe('has_upcoming_events');
    expect(body.events.map((e) => e.id)).toEqual([ev.id]);
    expect(body.events[0].title).toBe(`Upcoming ${TS}`);
    expect(await userRowsExist(host)).toEqual({ app: 1, auth: 1 });
    expect(await canSignIn(host)).toBe(true);

    // A published event with no start time is treated as upcoming too.
    const undated = await createEvent(host, { title: `Undated ${TS}` });
    const res2 = await del(host);
    const ids = ((await res2.json()) as { events: { id: string }[] }).events.map((e) => e.id).sort();
    expect(ids).toEqual([ev.id, undated.id].sort());

    // Cancel both -> deletion goes through; attendee RSVPs cascade away.
    for (const id of [ev.id, undated.id]) {
      const c = await SELF.fetch(`${EVENTS}/${id}`, {
        method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ status: 'cancelled' }),
      });
      expect(c.status).toBe(200);
    }
    expect((await del(host)).status).toBe(200);
    expect(await db.select().from(schema.events).where(eq(schema.events.hostId, host.id))).toHaveLength(0);
    expect(await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, ev.id))).toHaveLength(0);
    expect(await userRowsExist(host)).toEqual({ app: 0, auth: 0 });
    // The attendee survives and no longer sees the event's RSVP.
    expect((await userRowsExist(att)).app).toBe(1);
  });

  it('past, draft, cancelled and completed events do not block; they are deleted with their RSVPs, comments, R2 covers', async () => {
    const host = await signUp('past-host');
    const att = await signUp('past-att');
    const draft = await createEvent(host, { status: 'draft' });
    const cancelled = await createEvent(host, { status: 'cancelled', startsAt: iso(48 * HOUR) });
    const ended = await createEvent(host, { startsAt: iso(-5 * HOUR), endsAt: iso(-3 * HOUR) });
    const completed = await createEvent(host, { status: 'completed', startsAt: iso(-30 * HOUR) });
    const ids = [draft.id, cancelled.id, ended.id, completed.id];

    await rsvp(att, ended.id);
    await db.insert(schema.comments).values({ eventId: ended.id, userId: att.id, body: 'gg' });
    await db.insert(schema.reviews).values({ eventId: ended.id, reviewerId: att.id, hostId: host.id, hostRating: 4 });
    await env.SPOTSEEK_IMAGES.put(`events/${ended.id}/cover.png`, new Uint8Array([1, 2, 3]));
    await env.SPOTSEEK_IMAGES.put(`events/${draft.id}/cover.jpg`, new Uint8Array([1, 2, 3]));

    const res = await del(host);
    expect(res.status).toBe(200);

    for (const id of ids) {
      expect(await db.select().from(schema.events).where(eq(schema.events.id, id))).toHaveLength(0);
      expect(await db.select().from(schema.rsvps).where(eq(schema.rsvps.eventId, id))).toHaveLength(0);
    }
    expect(await db.select().from(schema.comments).where(eq(schema.comments.eventId, ended.id))).toHaveLength(0);
    expect(await db.select().from(schema.reviews).where(eq(schema.reviews.eventId, ended.id))).toHaveLength(0);
    expect(await env.SPOTSEEK_IMAGES.get(`events/${ended.id}/cover.png`)).toBeNull();
    expect(await env.SPOTSEEK_IMAGES.get(`events/${draft.id}/cover.jpg`)).toBeNull();
    expect(await userRowsExist(host)).toEqual({ app: 0, auth: 0 });
    expect((await userRowsExist(att)).app).toBe(1);
  });

  it('409 money_in_flight when a sponsorship on the host\'s (past) event is paid; allowed once released', async () => {
    const host = await signUp('money-host');
    const sponsor = await signUp('money-sponsor');
    const ev = await createEvent(host, { startsAt: iso(48 * HOUR) });
    const bid = await sponsorBid(sponsor, ev.id);
    // Event is over, sponsorship paid but not yet released.
    await db.update(schema.events).set({ status: 'completed', startsAt: new Date(Date.now() - 5 * HOUR), endsAt: new Date(Date.now() - 3 * HOUR) })
      .where(eq(schema.events.id, ev.id));
    await db.update(schema.sponsorships).set({ status: 'active', paymentStatus: 'paid' })
      .where(eq(schema.sponsorships.id, bid.id));

    const res = await del(host);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; sponsorships: { id: string; role: string; eventId: string }[] };
    expect(body.error).toBe('money_in_flight');
    expect(body.sponsorships).toEqual([expect.objectContaining({ id: bid.id, role: 'host', eventId: ev.id })]);
    expect(await userRowsExist(host)).toEqual({ app: 1, auth: 1 });

    await db.update(schema.sponsorships).set({ paymentStatus: 'released' }).where(eq(schema.sponsorships.id, bid.id));
    expect((await del(host)).status).toBe(200);
    expect(await userRowsExist(host)).toEqual({ app: 0, auth: 0 });
  });
});

describe('DELETE /api/account — sponsor', () => {
  it('409 money_in_flight when the sponsor has a paid sponsorship; refunded unblocks', async () => {
    const host = await signUp('sp-host');
    const sponsor = await signUp('sp-paid');
    const ev = await createEvent(host, { startsAt: iso(48 * HOUR) });
    const bid = await sponsorBid(sponsor, ev.id);
    await db.update(schema.sponsorships).set({ status: 'active', paymentStatus: 'paid' })
      .where(eq(schema.sponsorships.id, bid.id));

    const res = await del(sponsor);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; sponsorships: { id: string; role: string }[] };
    expect(body.error).toBe('money_in_flight');
    expect(body.sponsorships).toEqual([expect.objectContaining({ id: bid.id, role: 'sponsor' })]);
    expect(await userRowsExist(sponsor)).toEqual({ app: 1, auth: 1 });

    await db.update(schema.sponsorships).set({ paymentStatus: 'refunded', status: 'cancelled' })
      .where(eq(schema.sponsorships.id, bid.id));
    expect((await del(sponsor)).status).toBe(200);
    expect(await db.select().from(schema.sponsorships).where(eq(schema.sponsorships.id, bid.id))).toHaveLength(0);
    expect(await db.select().from(schema.sponsorProfiles).where(eq(schema.sponsorProfiles.id, sponsor.id))).toHaveLength(0);
    // The host's event is untouched.
    expect(await db.select().from(schema.events).where(eq(schema.events.id, ev.id))).toHaveLength(1);
  });

  it('deletes the sponsor profile and pending bids; a stripe account reference goes with the user row', async () => {
    const host = await signUp('sp2-host');
    const sponsor = await signUp('sp2');
    const ev = await createEvent(host, { startsAt: iso(48 * HOUR) });
    const bid = await sponsorBid(sponsor, ev.id);
    await db.update(schema.users).set({ stripeAccountId: `acct_acctdel_${TS}` }).where(eq(schema.users.id, sponsor.id));

    expect((await del(sponsor)).status).toBe(200);
    expect(await db.select().from(schema.sponsorships).where(eq(schema.sponsorships.id, bid.id))).toHaveLength(0);
    expect(await db.select().from(schema.sponsorProfiles).where(eq(schema.sponsorProfiles.id, sponsor.id))).toHaveLength(0);
    expect(await db.select().from(schema.users).where(eq(schema.users.stripeAccountId, `acct_acctdel_${TS}`))).toHaveLength(0);
    expect(await userRowsExist(sponsor)).toEqual({ app: 0, auth: 0 });
  });

  it('a user who is both host (past events only) and attendee is deleted in one call', async () => {
    const other = await signUp('both-other');
    const u = await signUp('both');
    const theirs = await createEvent(u, { startsAt: iso(-5 * HOUR), endsAt: iso(-3 * HOUR) });
    const otherEv = await createEvent(other, { capacity: 1, startsAt: iso(48 * HOUR) });
    await rsvp(u, otherEv.id);
    const waiter = await signUp('both-waiter');
    await rsvp(waiter, otherEv.id);

    expect((await del(u)).status).toBe(200);
    expect(await db.select().from(schema.events).where(eq(schema.events.id, theirs.id))).toHaveLength(0);
    const waiterRsvp = await db.select().from(schema.rsvps)
      .where(and(eq(schema.rsvps.eventId, otherEv.id), eq(schema.rsvps.userId, waiter.id)));
    expect(waiterRsvp[0].state).toBe('going');
  });
});
