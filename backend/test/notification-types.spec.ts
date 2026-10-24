/**
 * Per-type notification preferences: GET/PUT /api/notifications/prefs `types`,
 * and the notify() / fireReminders gating per group for push and email.
 * APNs and Resend are NEVER contacted: global fetch is wrapped, only
 * *.push.apple.com and api.resend.com calls are intercepted and counted
 * (Neon's HTTP driver needs the real fetch). The email guard's test hooks let
 * @spotseek.test addresses through to the (stubbed) Resend call and replace the
 * daily counter so the real email_send_counts row is never touched.
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import { notify, type NotificationType } from '../src/notifications';
import { fireReminders } from '../src/reminders';
import { configureApns, __flushPush, __resetApnsJwtCache } from '../src/apns';
import { __setEmailGuardTestHooks } from '../src/email-guard';
import { PREF_GROUPS, TYPE_GROUP, type PrefGroup } from '../src/notification-prefs';

const AUTH = 'https://example.com/api/auth';
const PUSH = 'https://example.com/api/push';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const NOTIFICATIONS = 'https://example.com/api/notifications';
const TS = Date.now();
const db = drizzle(neon(env.DATABASE_URL), { schema });

type Types = Record<PrefGroup, { push: boolean; email: boolean }>;
type Prefs = {
  emailEnabled: boolean; pushEnabled: boolean; radiusMiles: number;
  lastLat: number | null; lastLng: number | null; types: Types;
};

const allTrue = (): Types =>
  Object.fromEntries(PREF_GROUPS.map((g) => [g, { push: true, email: true }])) as Types;

async function signIn(suffix: string) {
  const email = `ntypes-${suffix}-${TS}@spotseek.test`;
  const pw = 'Ntypes_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = await sess.json() as { user: { id: string } };
  return { cookie, id: user.id };
}

const putPrefs = (cookie: string, body: unknown) =>
  SELF.fetch(`${NOTIFICATIONS}/prefs`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  });
const getPrefs = async (cookie: string) => {
  const res = await SELF.fetch(`${NOTIFICATIONS}/prefs`, { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return (await res.json() as { prefs: Prefs }).prefs;
};

// ─── fetch interception ───────────────────────────────────────────────────────
let apnsCalls = 0;
let resendCalls = 0;
const realFetch = globalThis.fetch;
let pem = '';

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
});

beforeEach(() => {
  apnsCalls = 0;
  resendCalls = 0;
  __resetApnsJwtCache();
  __setEmailGuardTestHooks({ allowTestDomains: true, reserve: async () => 1 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/push\.apple\.com/.test(url)) {
      apnsCalls += 1;
      return new Response('', { status: 200 });
    }
    if (url.startsWith('https://api.resend.com/')) {
      resendCalls += 1;
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  __setEmailGuardTestHooks(null);
  configureApns({});
});

// Applied AFTER any SELF.fetch (the worker re-configures APNs on every request).
const useApns = () =>
  configureApns({ APNS_KEY_P8: pem, APNS_KEY_ID: 'K7H32D38GD', APNS_TEAM_ID: 'XM2SC5YZ8C', APNS_TOPIC: 'com.spotseek.app' });

/** A user with a registered device and both master switches on. */
async function userWithDevice(suffix: string, types?: unknown, master: { push?: boolean; email?: boolean } = {}) {
  const u = await signIn(suffix);
  const token = `${suffix}${TS.toString(16)}`.padEnd(64, 'a').slice(0, 64).replace(/[^0-9a-f]/g, 'b');
  await SELF.fetch(`${PUSH}/tokens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
    body: JSON.stringify({ token, environment: 'production' }),
  });
  const res = await putPrefs(u.cookie, {
    pushEnabled: master.push ?? true, emailEnabled: master.email ?? true, ...(types ? { types } : {}),
  });
  expect(res.status).toBe(200);
  return u;
}

async function send(userId: string, type: NotificationType) {
  useApns();
  await notify(db, 'resend_key_test', { userId, type, title: `T ${type}`, body: 'B' });
  await __flushPush();
}

const rowCount = async (userId: string, type: string) =>
  (await db.query.notifications.findMany({ where: eq(schema.notifications.userId, userId) })).filter((n) => n.type === type).length;

// ─── API ──────────────────────────────────────────────────────────────────────

describe('prefs API: types', () => {
  it('GET returns a complete types object, all true, for a fresh user', async () => {
    const u = await signIn('get-default');
    const prefs = await getPrefs(u.cookie);
    expect(prefs.types).toEqual(allTrue());
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.pushEnabled).toBe(false);
    expect(prefs.radiusMiles).toBe(100);
  });

  it('PUT deep-merges a partial types patch and responds with the GET shape', async () => {
    const u = await signIn('put-merge');
    const res = await putPrefs(u.cookie, { types: { nearby: { email: false } } });
    expect(res.status).toBe(200);
    const { prefs } = await res.json() as { prefs: Prefs };
    const expected = allTrue();
    expected.nearby.email = false;
    expect(prefs.types).toEqual(expected);

    // A second patch touching another group and the other key keeps the first change.
    await putPrefs(u.cookie, { types: { reviews: { push: false }, nearby: { push: false } } });
    expected.reviews.push = false;
    expected.nearby.push = false;
    const got = await getPrefs(u.cookie);
    expect(got.types).toEqual(expected);
    expect(Object.keys(got).sort()).toEqual(Object.keys(prefs).sort());

    // Re-enabling works, and a PUT without `types` leaves them untouched.
    await putPrefs(u.cookie, { types: { nearby: { email: true, push: true } } });
    expected.nearby = { push: true, email: true };
    await putPrefs(u.cookie, { radiusMiles: 50 });
    const after = await getPrefs(u.cookie);
    expect(after.types).toEqual(expected);
    expect(after.radiusMiles).toBe(50);
  });

  it('rejects unknown groups, unknown keys and non-boolean values with 400 (and stores nothing)', async () => {
    const u = await signIn('put-invalid');
    const bad: unknown[] = [
      { types: { bogus: { push: false } } },
      { types: { nearby: { sms: false } } },
      { types: { nearby: { email: 'no' } } },
      { types: { nearby: { email: 0 } } },
      { types: { nearby: { email: null } } },
      { types: { nearby: false } },
      { types: { nearby: null } },
      { types: [] },
      { types: 'all' },
      { types: null },
      // valid part must not be applied when another part is invalid
      { emailEnabled: false, types: { reviews: { push: false }, bogus: {} } },
    ];
    for (const body of bad) {
      const res = await putPrefs(u.cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const prefs = await getPrefs(u.cookie);
    expect(prefs.types).toEqual(allTrue());
    expect(prefs.emailEnabled).toBe(true);
  });

  it('GET fills missing values when only part of a group is stored', async () => {
    const u = await signIn('get-partial');
    await db.insert(schema.notificationPrefs).values({ userId: u.id, typePrefs: { updates: { push: false } } });
    const expected = allTrue();
    expected.updates.push = false;
    expect((await getPrefs(u.cookie)).types).toEqual(expected);
  });
});

// ─── notify() gating ──────────────────────────────────────────────────────────

describe('notify() per-group gating', () => {
  const groupedTypes = Object.entries(TYPE_GROUP) as [NotificationType, PrefGroup][];

  it('maps the agreed types to the five groups', () => {
    expect(TYPE_GROUP).toEqual({
      reminder_24h: 'reminders', reminder_1h: 'reminders',
      event_cancelled: 'updates', venue_changed: 'updates', waitlist_promoted: 'updates',
      rsvp: 'hosting', favorite_nearby: 'nearby', review_request: 'reviews',
    });
  });

  it('sends push and email for every grouped type when all switches are on (default)', async () => {
    const u = await userWithDevice('all-on');
    for (const [type] of groupedTypes) {
      apnsCalls = 0; resendCalls = 0;
      await send(u.id, type);
      expect(apnsCalls, `push ${type}`).toBe(1);
      expect(resendCalls, `email ${type}`).toBe(1);
    }
  });

  for (const group of PREF_GROUPS) {
    it(`group "${group}": push off blocks push only, email off blocks email only, other groups unaffected`, async () => {
      const inGroup = groupedTypes.filter(([, g]) => g === group).map(([t]) => t);
      const others = groupedTypes.filter(([, g]) => g !== group).map(([t]) => t);

      const pushOff = await userWithDevice(`${group}-pushoff`, { [group]: { push: false } });
      for (const type of inGroup) {
        apnsCalls = 0; resendCalls = 0;
        await send(pushOff.id, type);
        expect(apnsCalls, `push ${type}`).toBe(0);
        expect(resendCalls, `email ${type}`).toBe(1);
        expect(await rowCount(pushOff.id, type), `row ${type}`).toBe(1);
      }
      for (const type of others) {
        apnsCalls = 0; resendCalls = 0;
        await send(pushOff.id, type);
        expect(apnsCalls, `other push ${type}`).toBe(1);
        expect(resendCalls, `other email ${type}`).toBe(1);
      }

      const emailOff = await userWithDevice(`${group}-emailoff`, { [group]: { email: false } });
      for (const type of inGroup) {
        apnsCalls = 0; resendCalls = 0;
        await send(emailOff.id, type);
        expect(apnsCalls, `push ${type}`).toBe(1);
        expect(resendCalls, `email ${type}`).toBe(0);
        expect(await rowCount(emailOff.id, type), `row ${type}`).toBe(1);
      }
      for (const type of others) {
        apnsCalls = 0; resendCalls = 0;
        await send(emailOff.id, type);
        expect(apnsCalls, `other push ${type}`).toBe(1);
        expect(resendCalls, `other email ${type}`).toBe(1);
      }
    });
  }

  it('still creates the in-app row when both channels of the group are off', async () => {
    const off = Object.fromEntries(PREF_GROUPS.map((g) => [g, { push: false, email: false }]));
    const u = await userWithDevice('both-off', off);
    for (const [type] of groupedTypes) {
      await send(u.id, type);
      expect(await rowCount(u.id, type), `row ${type}`).toBe(1);
    }
    expect(apnsCalls).toBe(0);
    expect(resendCalls).toBe(0);
    const list = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: u.cookie } });
    const { notifications } = await list.json() as { notifications: { type: string }[] };
    expect(notifications).toHaveLength(groupedTypes.length);
  });

  it('master switches still win: type on but master off sends nothing on that channel', async () => {
    const noPush = await userWithDevice('master-nopush', undefined, { push: false });
    await send(noPush.id, 'reminder_1h');
    expect(apnsCalls).toBe(0);
    expect(resendCalls).toBe(1);

    apnsCalls = 0; resendCalls = 0;
    const noEmail = await userWithDevice('master-noemail', undefined, { email: false });
    await send(noEmail.id, 'reminder_1h');
    expect(apnsCalls).toBe(1);
    expect(resendCalls).toBe(0);
  });

  it('ungrouped types are unaffected by the per-type switches', async () => {
    const off = Object.fromEntries(PREF_GROUPS.map((g) => [g, { push: false, email: false }]));
    const u = await userWithDevice('ungrouped', off);
    const ungrouped: NotificationType[] = [
      'payment_due', 'payment_received', 'payout_sent', 'payment_refunded',
      'sponsor_bid', 'sponsorship_request', 'sponsorship_accepted', 'sponsorship_rejected', 'sponsorship_cancelled',
      'event_under_review', 'event_removed',
    ];
    for (const type of ungrouped) {
      apnsCalls = 0; resendCalls = 0;
      await send(u.id, type);
      expect(apnsCalls, `push ${type}`).toBe(1);
      expect(resendCalls, `email ${type}`).toBe(1);
    }
    // ...and are governed by the master switches as before.
    const masterOff = await userWithDevice('ungrouped-master-off', undefined, { push: false, email: false });
    apnsCalls = 0; resendCalls = 0;
    await send(masterOff.id, 'payment_due');
    expect(apnsCalls).toBe(0);
    expect(resendCalls).toBe(0);
  });
});

// ─── Direct reminder email path (POST /api/reminders/send -> fireReminders) ───

describe('fireReminders email path', () => {
  it('honours the reminders email switch and the master email switch', async () => {
    const host = await signIn('fr-host');
    const on = await signIn('fr-on');
    const typeOff = await signIn('fr-typeoff');
    const masterOff = await signIn('fr-masteroff');
    await putPrefs(typeOff.cookie, { types: { reminders: { email: false } } });
    await putPrefs(masterOff.cookie, { emailEnabled: false });

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'Reminder Event', broadcastSubject: 'Soccer', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };
    for (const u of [on, typeOff, masterOff]) {
      const r = await SELF.fetch(RSVPS, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
        body: JSON.stringify({ eventId: event.id }),
      });
      expect(r.status).toBe(201);
    }

    resendCalls = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await fireReminders(neon(env.DATABASE_URL), event.id, 'resend_key_test');
    expect(result.sent).toBe(3);
    expect(resendCalls).toBe(1);
  });
});
