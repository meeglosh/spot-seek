/**
 * Push: token registration, direct-APNs sender (JWT, 410 pruning, missing
 * secret no-op) and the notify() hook. APNs is NEVER contacted: global fetch
 * is wrapped so only *.push.apple.com calls are intercepted (Neon's HTTP
 * driver needs the real fetch). Resend is not configured in tests, so no email
 * is sent (RESEND_API_KEY unset -> console fallback).
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import { notify } from '../src/notifications';
import {
  configureApns, signApnsJwt, __flushPush, __resetApnsJwtCache, sendApns,
} from '../src/apns';

const AUTH = 'https://example.com/api/auth';
const PUSH = 'https://example.com/api/push';
const NOTIFICATIONS = 'https://example.com/api/notifications';
const TS = Date.now();
const db = drizzle(neon(env.DATABASE_URL), { schema });

async function signIn(suffix: string) {
  const email = `push-${suffix}-${TS}@spotseek.test`;
  const pw = 'Push_Pwd_1!';
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

function hexToken(seed: string): string {
  return (seed + TS.toString(16)).padEnd(64, 'a').slice(0, 64).replace(/[^0-9a-f]/g, 'b');
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let pem = '';
let keyPair: CryptoKeyPair;

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----`;
});

const CFG = { keyId: 'K7H32D38GD', teamId: 'XM2SC5YZ8C', topic: 'com.spotseek.app' };

type ApnsCall = { url: string; headers: Record<string, string>; body: any };
let apnsCalls: ApnsCall[] = [];
let apnsResponder: () => Response = () => new Response('', { status: 200 });
const realFetch = globalThis.fetch;

beforeEach(() => {
  apnsCalls = [];
  apnsResponder = () => new Response('', { status: 200 });
  __resetApnsJwtCache();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/push\.apple\.com/.test(url)) {
      apnsCalls.push({
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(init.body) : null,
      });
      return apnsResponder();
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  configureApns({});
});

describe('APNs provider JWT', () => {
  it('has a well-formed ES256 header/claims and a verifiable signature', async () => {
    const now = 1_800_000_000_000;
    const jwt = await signApnsJwt({ keyP8: pem, keyId: CFG.keyId, teamId: CFG.teamId }, now);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))).toEqual({ alg: 'ES256', kid: 'K7H32D38GD' });
    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(c)))).toEqual({ iss: 'XM2SC5YZ8C', iat: 1_800_000_000 });
    const sig = b64urlToBytes(s);
    expect(sig.length).toBe(64); // raw r||s
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.publicKey,
      sig,
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('is cached across sends and posts to the right host/path/headers', async () => {
    const cfg = { keyP8: pem, ...CFG };
    const tok = hexToken('cache');
    await sendApns(tok, 'sandbox', { title: 'T', body: 'B', eventId: 'ev1' }, cfg);
    await sendApns(tok, 'production', { title: 'T', body: 'B' }, cfg);
    expect(apnsCalls).toHaveLength(2);
    expect(apnsCalls[0].url).toBe(`https://api.sandbox.push.apple.com/3/device/${tok}`);
    expect(apnsCalls[1].url).toBe(`https://api.push.apple.com/3/device/${tok}`);
    expect(apnsCalls[0].headers['apns-topic']).toBe('com.spotseek.app');
    expect(apnsCalls[0].headers['apns-push-type']).toBe('alert');
    expect(apnsCalls[0].headers.authorization).toBe(apnsCalls[1].headers.authorization);
    expect(apnsCalls[0].body).toEqual({ aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, eventId: 'ev1' });
  });
});

describe('push token routes', () => {
  it('requires auth and rejects malformed tokens', async () => {
    const anon = await SELF.fetch(`${PUSH}/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: hexToken('x') }),
    });
    expect(anon.status).toBe(401);
    const u = await signIn('badtok');
    const bad = await SELF.fetch(`${PUSH}/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ token: 'not-hex!' }),
    });
    expect(bad.status).toBe(400);
  });

  it('register is idempotent; DELETE removes only the caller\'s token', async () => {
    const u = await signIn('reg');
    const other = await signIn('reg-other');
    const token = hexToken('reg');
    const post = () => SELF.fetch(`${PUSH}/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ token, environment: 'sandbox' }),
    });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    let rows = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, token) });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(u.id);
    expect(rows[0].environment).toBe('sandbox');

    const foreign = await SELF.fetch(`${PUSH}/tokens/${token}`, { method: 'DELETE', headers: { Cookie: other.cookie } });
    expect(foreign.status).toBe(200);
    rows = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, token) });
    expect(rows).toHaveLength(1);

    const del = await SELF.fetch(`${PUSH}/tokens/${token}`, { method: 'DELETE', headers: { Cookie: u.cookie } });
    expect(del.status).toBe(200);
    rows = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, token) });
    expect(rows).toHaveLength(0);
  });
});

describe('notify() push hook', () => {
  // Applied AFTER any SELF.fetch: the worker's request middleware re-configures
  // APNs from the (secret-less) test env on every request.
  const useConfig = () =>
    configureApns({ APNS_KEY_P8: pem, APNS_KEY_ID: CFG.keyId, APNS_TEAM_ID: CFG.teamId, APNS_TOPIC: CFG.topic });

  async function userWithToken(suffix: string, pushEnabled: boolean) {
    const u = await signIn(suffix);
    const token = hexToken(suffix);
    await SELF.fetch(`${PUSH}/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ token, environment: 'production' }),
    });
    await SELF.fetch(`${NOTIFICATIONS}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ pushEnabled }),
    });
    return { ...u, token };
  }

  it('pushes title/body/eventId only when pushEnabled', async () => {
    const on = await userWithToken('notif-on', true);
    const off = await userWithToken('notif-off', false);
    const eRes = await SELF.fetch('https://example.com/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: on.cookie },
      body: JSON.stringify({ title: 'Push Event', broadcastSubject: 'Soccer', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };
    useConfig();

    await notify(db, undefined, { userId: off.id, type: 'rsvp', title: 'Off', body: 'nope' });
    await __flushPush();
    expect(apnsCalls).toHaveLength(0);

    const eventId = event.id;
    await notify(db, undefined, { userId: on.id, type: 'rsvp', title: 'Hello', body: 'World', eventId });
    await __flushPush();
    expect(apnsCalls).toHaveLength(1);
    expect(apnsCalls[0].url).toContain(on.token);
    expect(apnsCalls[0].body.aps.alert).toEqual({ title: 'Hello', body: 'World' });
    expect(apnsCalls[0].body.eventId).toBe(eventId);
  });

  it('deletes the token when APNs answers 410', async () => {
    const u = await userWithToken('gone', true);
    useConfig();
    apnsResponder = () => new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 });
    await notify(db, undefined, { userId: u.id, type: 'rsvp', title: 'x', body: 'y' });
    await __flushPush();
    expect(apnsCalls).toHaveLength(1);
    const rows = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, u.token) });
    expect(rows).toHaveLength(0);
  });

  it('deletes the token on 400 BadDeviceToken but keeps it on other failures', async () => {
    const u = await userWithToken('bad', true);
    useConfig();
    apnsResponder = () => new Response(JSON.stringify({ reason: 'TooManyRequests' }), { status: 429 });
    await notify(db, undefined, { userId: u.id, type: 'rsvp', title: 'x', body: 'y' });
    await __flushPush();
    expect(await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, u.token) })).toHaveLength(1);

    apnsResponder = () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 });
    await notify(db, undefined, { userId: u.id, type: 'rsvp', title: 'x', body: 'y' });
    await __flushPush();
    expect(await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, u.token) })).toHaveLength(0);
  });

  it('is a no-op (with a log line) when the secret is missing', async () => {
    const u = await userWithToken('nosecret', true);
    configureApns({}); // no APNS_KEY_P8
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await notify(db, undefined, { userId: u.id, type: 'rsvp', title: 'x', body: 'y' });
    await __flushPush();
    expect(apnsCalls).toHaveLength(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('[apns]') && String(c[0]).includes('not configured'))).toBe(true);
    expect(await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.token, u.token) })).toHaveLength(1);
  });
});
