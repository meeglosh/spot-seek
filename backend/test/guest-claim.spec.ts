/**
 * POST /api/rsvps/claim: a guest (web) RSVP becomes an account RSVP only when the
 * user proves possession of that guest's emailed token. Email matching never claims
 * (account emails are unverified). Also covers the guest status page claim link /
 * claimed view, cancel refusal on claimed rows, the /e/:id/claim/:token web fallback
 * and F26 (a claimed email is indistinguishable from a fresh one on POST /rsvp/:id).
 * Timestamp-unique fixtures (shared dev DB); Resend is mocked.
 */
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import worker from '../src/index';
import { __setEmailGuardTestHooks } from '../src/email-guard';

const BASE = 'https://example.com';
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const sqlRaw = neon(env.DATABASE_URL);

interface SentEmail { to: string; subject: string; html: string; text: string }
let sent: SentEmail[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  sent = [];
  __setEmailGuardTestHooks({ allowTestDomains: true, reserve: async () => 1 });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(String(init?.body)) as SentEmail);
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setEmailGuardTestHooks(null);
});

function app(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  return worker.fetch(
    new Request(`${BASE}${path}`, init),
    { ...env, RESEND_API_KEY: 'test-resend-key' } as unknown as Env,
    ctx,
  ) as Promise<Response>;
}

let ipCounter = 0;
const freshIp = () => `10.${(TS + 7) % 250}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

interface U { id: string; email: string; cookie: string }

async function signUp(suffix: string, email?: string): Promise<U> {
  const e = email ?? `gc-${suffix}-${TS}@spotseek.test`;
  const password = 'GuestClaim_Pass_1!';
  await app('/api/auth/sign-up/email', { method: 'POST', headers: json, body: JSON.stringify({ email: e, password, name: suffix }) });
  const res = await app('/api/auth/sign-in/email', { method: 'POST', headers: json, body: JSON.stringify({ email: e, password }) });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await app('/api/auth/get-session', { headers: { Cookie: cookie } });
  const { user } = (await sess.json()) as { user: { id: string } };
  return { id: user.id, email: e, cookie };
}

async function createEvent(host: U, extra: Record<string, unknown> = {}) {
  const res = await app('/api/events', {
    method: 'POST', headers: { ...json, Cookie: host.cookie },
    body: JSON.stringify({
      title: `Guest Claim ${TS}`, broadcastSubject: 'Game', status: 'published',
      startsAt: iso(HOUR), ...extra,
    }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

const guestPost = (eventId: string, body: Record<string, unknown>) =>
  app(`/rsvp/${eventId}`, {
    method: 'POST', headers: { ...json, 'cf-connecting-ip': freshIp() }, body: JSON.stringify(body),
  });

let emailSeq = 0;
/** Guest RSVP + confirm. Returns the token (and the guest email). */
async function guestJoin(eventId: string, confirm = true) {
  const email = `gc-guest-${emailSeq++}-${TS}@spotseek.test`;
  expect((await guestPost(eventId, { name: 'Gus Guest', email })).status).toBe(202);
  const mail = sent.filter((m) => m.to === email).at(-1)!;
  const m = mail.html.match(new RegExp(`/rsvp/${eventId}/([0-9a-f]{48})/confirm`));
  expect(m).not.toBeNull();
  const token = m![1];
  if (confirm) await app(`/rsvp/${eventId}/${token}/confirm`);
  return { token, email };
}

const claim = (u: U | null, body: unknown) =>
  app('/api/rsvps/claim', {
    method: 'POST',
    headers: { ...json, ...(u ? { Cookie: u.cookie } : {}) },
    body: JSON.stringify(body),
  });
const mineOf = async (u: U) =>
  ((await (await app('/api/rsvps/mine', { headers: { Cookie: u.cookie } })).json()) as {
    rsvps: { id: string; eventId: string; state: string }[];
  }).rsvps;
const goingCount = async (host: U, eventId: string) => {
  const d = (await (await app('/api/dashboard', { headers: { Cookie: host.cookie } })).json()) as {
    events: { id: string; rsvpCounts: Record<string, number> }[];
  };
  return d.events.find((e) => e.id === eventId)!.rsvpCounts.going;
};
const guestRow = async (eventId: string, token: string) =>
  (await sqlRaw`SELECT state, claimed_user_id FROM guest_rsvps WHERE event_id = ${eventId} AND token = ${token}`)[0] as
    { state: string; claimed_user_id: string | null };

let host: U;
let user: U;
let other: U;
beforeAll(async () => {
  [host, user, other] = await Promise.all([signUp('host'), signUp('user'), signUp('other')]);
}, 60_000);

describe('POST /api/rsvps/claim', () => {
  it('401s when not signed in', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    expect((await claim(null, { eventId: ev.id, token })).status).toBe(401);
  }, 60_000);

  it('404s for malformed, unknown or mismatched token/eventId', async () => {
    const [ev1, ev2] = [await createEvent(host), await createEvent(host)];
    const { token } = await guestJoin(ev1.id);
    const expectNotFound = async (body: unknown) => {
      const res = await claim(user, body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    };
    await expectNotFound({ eventId: ev1.id, token: 'short' });
    await expectNotFound({ eventId: 'not-a-uuid', token });
    await expectNotFound({ eventId: ev1.id });
    await expectNotFound({ eventId: ev1.id, token: 'a'.repeat(48) });
    await expectNotFound({ eventId: ev2.id, token }); // token belongs to another event
    expect((await guestRow(ev1.id, token)).claimed_user_id).toBeNull();
  }, 60_000);

  it('claims with the token: appears in /mine, counts once, is idempotent', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    expect(await goingCount(host, ev.id)).toBe(1);

    const res = await claim(user, { eventId: ev.id, token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rsvp: { id: string; eventId: string; state: string } };
    expect(body.ok).toBe(true);
    expect(body.rsvp).toMatchObject({ eventId: ev.id, state: 'going' });

    const mine = await mineOf(user);
    expect(mine.find((r) => r.eventId === ev.id)?.id).toBe(body.rsvp.id);
    expect(await goingCount(host, ev.id)).toBe(1);
    expect((await guestRow(ev.id, token)).claimed_user_id).toBe(user.id);

    const again = await claim(user, { eventId: ev.id, token });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { rsvp: { id: string } }).rsvp.id).toBe(body.rsvp.id);
    expect((await mineOf(user)).filter((r) => r.eventId === ev.id)).toHaveLength(1);
    expect(await goingCount(host, ev.id)).toBe(1);
  }, 90_000);

  it('409 already_claimed when another user holds the claim', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    expect((await claim(user, { eventId: ev.id, token })).status).toBe(200);
    const res = await claim(other, { eventId: ev.id, token });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_claimed' });
    expect((await mineOf(other)).find((r) => r.eventId === ev.id)).toBeUndefined();
  }, 90_000);

  it('409 not_confirmed for pending and cancelled guest rows', async () => {
    const ev = await createEvent(host);
    const pending = await guestJoin(ev.id, false);
    let res = await claim(user, { eventId: ev.id, token: pending.token });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_confirmed' });

    const cancelled = await guestJoin(ev.id);
    await app(`/rsvp/${ev.id}/${cancelled.token}/cancel`, { method: 'POST' });
    res = await claim(user, { eventId: ev.id, token: cancelled.token });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_confirmed' });
    expect((await mineOf(user)).find((r) => r.eventId === ev.id)).toBeUndefined();
  }, 90_000);

  it('applies the hidden / ended / host-blocked gates and leaves the row unclaimed (F20/F32)', async () => {
    const [hiddenEv, endedEv, blockedEv] = [await createEvent(host), await createEvent(host), await createEvent(host)];
    const [hidden, ended, blocked] = [await guestJoin(hiddenEv.id), await guestJoin(endedEv.id), await guestJoin(blockedEv.id)];
    await sqlRaw`UPDATE events SET moderation_status = 'hidden' WHERE id = ${hiddenEv.id}`;
    await sqlRaw`UPDATE events SET starts_at = ${iso(-30 * HOUR)}, ends_at = ${iso(-26 * HOUR)} WHERE id = ${endedEv.id}`;
    await sqlRaw`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${host.id}, ${user.id})`;

    let res = await claim(user, { eventId: hiddenEv.id, token: hidden.token });
    expect([res.status, await res.json()]).toEqual([404, { error: 'not_found' }]);
    res = await claim(user, { eventId: endedEv.id, token: ended.token });
    expect([res.status, await res.json()]).toEqual([409, { error: 'event_ended' }]);
    res = await claim(user, { eventId: blockedEv.id, token: blocked.token });
    expect([res.status, await res.json()]).toEqual([403, { error: 'forbidden' }]);

    for (const [ev, g] of [[hiddenEv, hidden], [endedEv, ended], [blockedEv, blocked]] as const) {
      expect((await guestRow(ev.id, g.token)).claimed_user_id).toBeNull();
      expect((await mineOf(user)).find((r) => r.eventId === ev.id)).toBeUndefined();
    }
    await sqlRaw`DELETE FROM user_blocks WHERE blocker_id = ${host.id} AND blocked_id = ${user.id}`;
  }, 120_000);

  it('409 own_event when the host claims, and the row stays unclaimed', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    const res = await claim(host, { eventId: ev.id, token });
    expect([res.status, await res.json()]).toEqual([409, { error: 'own_event' }]);
    expect((await guestRow(ev.id, token)).claimed_user_id).toBeNull();
    expect((await mineOf(host)).find((r) => r.eventId === ev.id)).toBeUndefined();
    expect(await goingCount(host, ev.id)).toBe(1);
  }, 90_000);

  it('rate limits repeated claim attempts per user', async () => {
    const ev = await createEvent(host);
    const rl = await signUp('ratelimit');
    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) {
      const r = await claim(rl, { eventId: ev.id, token: 'a'.repeat(48) });
      statuses.push(r.status);
      if (r.status === 429) break;
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 404)).toBe(true);
  }, 90_000);
});

describe('email matching no longer claims (F8/F12/F13)', () => {
  it('a user signing up with the guest email gets nothing; any authed request claims nothing', async () => {
    const ev = await createEvent(host);
    const { token, email } = await guestJoin(ev.id);
    const squatter = await signUp('squat', email);
    expect(await mineOf(squatter)).toEqual([]);
    expect(await mineOf(squatter)).toEqual([]);
    expect((await guestRow(ev.id, token)).claimed_user_id).toBeNull();
    expect(await goingCount(host, ev.id)).toBe(1);
  }, 90_000);
});

describe('F26: POST /rsvp/:eventId for an already-claimed email', () => {
  it('is indistinguishable from a fresh pending RSVP and sends no email', async () => {
    const ev = await createEvent(host);
    const { token, email } = await guestJoin(ev.id);
    expect((await claim(user, { eventId: ev.id, token })).status).toBe(200);

    const fresh = `gc-fresh-${TS}@spotseek.test`;
    for (const mode of ['json', 'form'] as const) {
      const send = (e: string) =>
        mode === 'json'
          ? guestPost(ev.id, { name: 'Gus Guest', email: e })
          : app(`/rsvp/${ev.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': freshIp() },
              body: new URLSearchParams({ name: 'Gus Guest', email: e }).toString(),
            });
      sent = [];
      const rClaimed = await send(email);
      expect(sent.filter((m) => m.to === email)).toHaveLength(0);
      const rFresh = await send(fresh);
      expect(rClaimed.status).toBe(rFresh.status);
      expect(rClaimed.status).toBe(202);
      const norm = (t: string, e: string) => t.split(e).join('EMAIL');
      expect(norm(await rClaimed.text(), email)).toBe(norm(await rFresh.text(), fresh));
    }
    // The claimed row is untouched.
    expect((await guestRow(ev.id, token)).claimed_user_id).toBe(user.id);
  }, 90_000);
});

describe('guest status page and cancel with claiming', () => {
  it('shows an "Add to my SpotSeek account" link for unclaimed going/waitlisted rows', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    const html = await (await app(`/rsvp/${ev.id}/${token}`)).text();
    expect(html).toContain('Add to my SpotSeek account');
    expect(html).toContain(`https://spotseek.app/e/${ev.id}/claim/${token}`);
    expect(html).toContain('Cancel my RSVP');

    const pending = await guestJoin(ev.id, false);
    const pendingHtml = await (await app(`/rsvp/${ev.id}/${pending.token}`)).text();
    expect(pendingHtml).not.toContain('Add to my SpotSeek account');
  }, 90_000);

  it('claimed rows show the in-app message, no cancel form, and cancel changes nothing', async () => {
    const ev = await createEvent(host, { capacity: 1 });
    const going = await guestJoin(ev.id);
    const waiting = await guestJoin(ev.id); // waitlisted behind the going guest
    expect((await guestRow(ev.id, waiting.token)).state).toBe('waitlisted');
    expect((await claim(user, { eventId: ev.id, token: going.token })).status).toBe(200);

    const html = await (await app(`/rsvp/${ev.id}/${going.token}`)).text();
    expect(html).toContain('This RSVP is now in your SpotSeek app');
    expect(html).not.toContain('Cancel my RSVP');
    expect(html).not.toContain('Add to my SpotSeek account');
    expect(html).not.toContain("You're going");

    const res = await app(`/rsvp/${ev.id}/${going.token}/cancel`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('This RSVP is now in your SpotSeek app');
    // Nothing changed and nobody was promoted.
    expect(await guestRow(ev.id, going.token)).toMatchObject({ state: 'going', claimed_user_id: user.id });
    expect((await guestRow(ev.id, waiting.token)).state).toBe('waitlisted');
    expect((await mineOf(user)).find((r) => r.eventId === ev.id)?.state).toBe('going');
  }, 120_000);
});

describe('GET /e/:id/claim/:token web fallback', () => {
  it('returns 200 noindex HTML with install CTAs and a link back to the status page', async () => {
    const ev = await createEvent(host);
    const { token } = await guestJoin(ev.id);
    const res = await app(`/e/${ev.id}/claim/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('noindex');
    expect(html).toContain('Open SpotSeek to add this RSVP to your account');
    expect(html).toContain('App Store coming soon');
    expect(html).toContain(`https://spotseek.app/rsvp/${ev.id}/${token}`);
    // The plain event page still resolves separately.
    expect((await app(`/e/${ev.id}`)).status).toBe(200);
  }, 60_000);

  it('404s for malformed ids or tokens', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect((await app(`/e/not-a-uuid/claim/${'a'.repeat(48)}`)).status).toBe(404);
    expect((await app(`/e/${id}/claim/zzz`)).status).toBe(404);
  });
});
