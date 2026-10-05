/**
 * Security hardening tests: admin-gated job triggers, constant-time admin
 * compare, RSVP capacity bypass, chat WebSocket auth, private venue on /e/:id,
 * and rate limiting. Timestamp-unique fixtures (shared dev DB).
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { isAdminAuthorized } from '../src/admin';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const EVENTS = `${BASE}/api/events`;
const RSVPS = `${BASE}/api/rsvps`;
const CHAT = `${BASE}/api/chat`;
const ADMIN_BEARER = 'Bearer test-admin-secret';

const TS = Date.now();
const json = { 'Content-Type': 'application/json' };

async function signUp(suffix: string): Promise<string> {
  const email = `sec-${suffix}-${TS}@spotseek.test`;
  const password = 'Sec_Password_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function createEvent(cookie: string, extra: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { ...json, Cookie: cookie },
    body: JSON.stringify({ title: `Sec Event ${TS}`, broadcastSubject: 'Game', status: 'published', ...extra }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

const rsvp = (cookie: string, eventId: string) =>
  SELF.fetch(RSVPS, { method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ eventId }) });
const patchRsvp = (cookie: string, id: string, state: string) =>
  SELF.fetch(`${RSVPS}/${id}`, { method: 'PATCH', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ state }) });

let host: string;
let a1: string;
let a2: string;

beforeAll(async () => {
  [host, a1, a2] = await Promise.all([signUp('host'), signUp('a1'), signUp('a2')]);
});

describe('admin-only job triggers', () => {
  const endpoints = [
    `${BASE}/api/payments/run-sweeps`,
    `${BASE}/api/notifications/run-reminders`,
    `${BASE}/api/notifications/run-reviews`,
  ];

  for (const url of endpoints) {
    const name = url.replace(`${BASE}/api/`, '');
    it(`${name}: no credentials -> 401`, async () => {
      expect((await SELF.fetch(url, { method: 'POST' })).status).toBe(401);
    });
    it(`${name}: signed-in regular user -> 401`, async () => {
      expect((await SELF.fetch(url, { method: 'POST', headers: { Cookie: a1 } })).status).toBe(401);
    });
    it(`${name}: wrong admin secret -> 401`, async () => {
      expect((await SELF.fetch(url, { method: 'POST', headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    });
  }

  it('run-sweeps: admin succeeds and keeps the {sponsorshipIds} scope', async () => {
    const res = await SELF.fetch(endpoints[0], {
      method: 'POST', headers: { ...json, Authorization: ADMIN_BEARER },
      body: JSON.stringify({ sponsorshipIds: [] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ released: 0, refunded: 0 });
  });

  it('run-reminders / run-reviews: admin succeeds', async () => {
    for (const url of endpoints.slice(1)) {
      const res = await SELF.fetch(url, { method: 'POST', headers: { Authorization: ADMIN_BEARER } });
      expect(res.status).toBe(200);
    }
  });
});

describe('admin secret comparison', () => {
  const env = { ADMIN_SECRET: 's3cret-value' } as Env;
  it('accepts only the exact bearer', async () => {
    expect(await isAdminAuthorized(env, 'Bearer s3cret-value')).toBe(true);
    expect(await isAdminAuthorized(env, 'Bearer s3cret-valuX')).toBe(false); // same length
    expect(await isAdminAuthorized(env, 'Bearer s3cret')).toBe(false); // shorter
    expect(await isAdminAuthorized(env, 'Bearer s3cret-value-and-more')).toBe(false); // longer
    expect(await isAdminAuthorized(env, 's3cret-value')).toBe(false); // no scheme
    expect(await isAdminAuthorized(env, undefined)).toBe(false);
  });
  it('fails closed when ADMIN_SECRET is unset, even for "Bearer undefined"/empty', async () => {
    expect(await isAdminAuthorized({} as Env, 'Bearer undefined')).toBe(false);
    expect(await isAdminAuthorized({ ADMIN_SECRET: '' } as Env, 'Bearer ')).toBe(false);
  });
});

describe('RSVP capacity bypass via PATCH', () => {
  it('waitlisted user cannot PATCH to going on a full event (409), but can once a slot frees', async () => {
    const event = await createEvent(host, { capacity: 1 });
    const r1 = await (await rsvp(a1, event.id)).json() as { rsvp: { id: string; state: string } };
    const r2 = await (await rsvp(a2, event.id)).json() as { rsvp: { id: string; state: string } };
    expect(r1.rsvp.state).toBe('going');
    expect(r2.rsvp.state).toBe('waitlisted');

    const blocked = await patchRsvp(a2, r2.rsvp.id, 'going');
    expect(blocked.status).toBe(409);

    // Still waitlisted (verify via /mine).
    const mine = await (await SELF.fetch(`${RSVPS}/mine`, { headers: { Cookie: a2 } })).json() as
      { rsvps: { id: string; state: string }[] };
    expect(mine.rsvps.find((r) => r.id === r2.rsvp.id)?.state).toBe('waitlisted');

    // A cancelled user cannot revive straight to going on a full event either.
    expect((await patchRsvp(a1, r1.rsvp.id, 'cancelled')).status).toBe(200);
    const ok = await patchRsvp(a2, r2.rsvp.id, 'going');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { rsvp: { state: string } }).rsvp.state).toBe('going');
    expect((await patchRsvp(a1, r1.rsvp.id, 'going')).status).toBe(409);
  });

  it('uncapped events still allow PATCH to going', async () => {
    const event = await createEvent(host);
    const r = await (await rsvp(a1, event.id)).json() as { rsvp: { id: string } };
    await patchRsvp(a1, r.rsvp.id, 'interested');
    expect((await patchRsvp(a1, r.rsvp.id, 'going')).status).toBe(200);
  });
});

describe('chat WebSocket auth', () => {
  it('rejects an anonymous connection with 401', async () => {
    const event = await createEvent(host);
    const res = await SELF.fetch(`${CHAT}/${event.id}/ws`, { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(401);
  });

  it('rejects anonymous even if the client supplies userId query/header', async () => {
    const event = await createEvent(host);
    const res = await SELF.fetch(`${CHAT}/${event.id}/ws?userId=victim`, {
      headers: { Upgrade: 'websocket', 'x-spotseek-user-id': 'victim' },
    });
    expect(res.status).toBe(401);
  });

  it('accepts an authenticated connection (101) and identity comes from the session', async () => {
    const event = await createEvent(host);
    const res = await SELF.fetch(`${CHAT}/${event.id}/ws?userId=victim`, {
      headers: { Upgrade: 'websocket', Cookie: a1, 'x-spotseek-user-id': 'victim' },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const sent = new Promise<{ userId: string }>((resolve) => {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data as string);
        if (m.type === 'message') resolve(m);
      });
    });
    ws.send(JSON.stringify({ type: 'message', body: `hi ${TS}` }));
    const m = await sent;
    expect(m.userId).not.toBe('victim');
    expect(m.userId).not.toBe('anonymous');
    ws.close();
  });

  it('chat write routes require auth (POST and DELETE -> 401)', async () => {
    const event = await createEvent(host);
    const post = await SELF.fetch(`${CHAT}/${event.id}`, { method: 'POST', headers: json, body: JSON.stringify({ body: 'x' }) });
    expect(post.status).toBe(401);
    const del = await SELF.fetch(`${CHAT}/${event.id}/00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
    expect(del.status).toBe(401);
  });
});

describe('/e/:id private location', () => {
  it('omits the venue name for private-location events, shows it for public ones', async () => {
    const secret = `Secret Lair ${TS}`;
    const priv = await createEvent(host, {
      venueName: secret, venueAddress: `1 Hidden Street ${TS}`, isPrivateLocation: true,
    });
    const pub = await createEvent(host, { venueName: `Public Bar ${TS}`, isPrivateLocation: false });

    const privHtml = await (await SELF.fetch(`${BASE}/e/${priv.id}`)).text();
    expect(privHtml).not.toContain(secret);
    expect(privHtml).not.toContain('Hidden Street');
    expect(privHtml).toContain('og:description');

    const pubHtml = await (await SELF.fetch(`${BASE}/e/${pub.id}`)).text();
    expect(pubHtml).toContain(`Public Bar ${TS}`);
  });
});

describe('rate limiting', () => {
  // The limiter counts in fixed windows, so a burst that straddles a window
  // boundary can reset mid-run. Send well past the limit and assert that a 429
  // appears, after no more than `limit` allowed requests, rather than pinning
  // the exact index.
  async function burst(max: number, send: () => Promise<number>) {
    const statuses: number[] = [];
    for (let i = 0; i < max; i++) {
      const status = await send();
      statuses.push(status);
      if (status === 429) break;
    }
    return statuses;
  }

  it('sign-in attempts trip 429 after 10/min per IP; other IPs unaffected', async () => {
    const ip = `203.0.113.${TS % 250}`;
    const attempt = (addr: string) => SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: { ...json, 'cf-connecting-ip': addr },
      body: JSON.stringify({ email: `nobody-${TS}@spotseek.test`, password: 'wrong-password-1' }),
    }).then((r) => r.status);
    const statuses = await burst(25, () => attempt(ip));
    expect(statuses.at(-1)).toBe(429);
    expect(await attempt(`198.51.100.${TS % 250}`)).not.toBe(429);
  }, 60_000);

  it('sign-up is rate limited too', async () => {
    const ip = `192.0.2.${TS % 250}`;
    const statuses = await burst(25, () => SELF.fetch(`${AUTH}/sign-up/email`, {
      method: 'POST', headers: { ...json, 'cf-connecting-ip': ip },
      body: JSON.stringify({ email: 'not-an-email', password: 'x', name: 'x' }), // cheap 400 from Better Auth
    }).then((r) => r.status));
    expect(statuses.at(-1)).toBe(429);
  }, 60_000);

  it('RSVP writes trip 429 after 30/min per user', async () => {
    const cookie = await signUp('ratelimit');
    // No eventId -> cheap 400 after the limiter runs.
    const statuses = await burst(75, () =>
      SELF.fetch(RSVPS, { method: 'POST', headers: { ...json, Cookie: cookie }, body: '{}' }).then((r) => r.status));
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 400)).toBe(true);
  }, 120_000);
});
