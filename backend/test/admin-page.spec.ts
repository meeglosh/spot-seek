/**
 * Admin moderation web page: cookie login, CSRF + Origin checks, queue view,
 * restore/remove, tampered/expired cookies, login rate limit, digest link.
 * Timestamp-unique fixtures (shared dev DB). Resend is stubbed.
 */
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import worker from '../src/index';
import { __setEmailGuardTestHooks } from '../src/email-guard';
import { __setClassifierForTests } from '../src/moderation/classifier';
import { runModerationDigest } from '../src/moderation/admin';
import { signAdminSession, verifyAdminSession } from '../src/moderation/admin-page';

vi.setConfig({ testTimeout: 30_000 });

const BASE = 'https://example.com';
const SECRET = 'test-admin-secret';
const json = { 'Content-Type': 'application/json' };
const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
const TS = Date.now();
const realFetch = globalThis.fetch;
const sql = () => neon(env.DATABASE_URL);
let ipCounter = 0;
const freshIp = () => `10.77.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;
let sentEmails: { to: string; subject: string }[] = [];

function app(path: string, init: RequestInit = {}, e: object = env) {
  return worker.fetch(new Request(`${BASE}${path}`, init), e as unknown as Env, createExecutionContext()) as Promise<Response>;
}

beforeEach(() => {
  sentEmails = [];
  __setEmailGuardTestHooks({ allowTestDomains: true, reserve: async () => 1 });
  __setClassifierForTests(async () => ({ safe: true, categories: [] }));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.resend.com/')) {
      sentEmails.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setEmailGuardTestHooks(null);
  __setClassifierForTests(null);
});

const login = (secret: string, ip = freshIp()) =>
  app('/admin/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { ...form, 'cf-connecting-ip': ip },
    body: new URLSearchParams({ secret }).toString(),
  });

async function adminCookie() {
  const res = await login(SECRET);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function csrfOf(cookie: string) {
  const html = await (await app('/admin/moderation', { headers: { Cookie: cookie } })).text();
  return /name="csrf" value="([0-9a-f]+)"/.exec(html)?.[1] ?? '';
}

async function seedFlagged(tag: string) {
  const email = `adm-${tag}-${TS}@spotseek.test`;
  const pw = 'Adminpage_Pwd_1!';
  const jsonInit = (b: unknown, extra: Record<string, string> = {}) => ({
    method: 'POST', headers: { ...json, ...extra }, body: JSON.stringify(b),
  });
  await app('/api/auth/sign-up/email', jsonInit({ email, password: pw, name: `Host ${tag}` }));
  const si = await app('/api/auth/sign-in/email', jsonInit({ email, password: pw }));
  const cookie = (si.headers.get('set-cookie') ?? '').split(';')[0];
  const res = await app('/api/events', jsonInit({
    title: `Admin Page Party ${tag} ${TS}`, broadcastSubject: 'Basketball', status: 'published',
    startsAt: new Date(Date.now() + 60_000).toISOString(),
  }, { Cookie: cookie }));
  const ev = ((await res.json()) as { event: { id: string; title: string } }).event;
  await sql()`UPDATE events SET moderation_status = 'flagged' WHERE id = ${ev.id}`;
  return ev;
}
const modStatus = async (id: string) =>
  ((await sql()`SELECT moderation_status AS s FROM events WHERE id = ${id}`) as { s: string }[])[0]?.s;

const post = (path: string, cookie: string, fields: Record<string, string>, origin: string | null = BASE) =>
  app(path, {
    method: 'POST', redirect: 'manual',
    headers: { ...form, Cookie: cookie, ...(origin ? { Origin: origin } : {}) },
    body: new URLSearchParams(fields).toString(),
  });

describe('admin login', () => {
  it('rejects a wrong secret and sets no cookie', async () => {
    const res = await login('nope');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sets a hardened cookie on the right secret, without leaking the secret', async () => {
    const res = await login(SECRET);
    expect(res.status).toBe(303);
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Strict/i);
    expect(sc).toMatch(/Path=\/admin/);
    expect(sc).not.toContain(SECRET);
  });

  it('rate limits login attempts per IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await login('wrong', ip)).status);
    expect(statuses[0]).toBe(401);
    expect(statuses).toContain(429);
  });

  it('logout clears the cookie', async () => {
    const cookie = await adminCookie();
    const res = await post('/admin/logout', cookie, {});
    expect(res.headers.get('set-cookie') ?? '').toMatch(/ss_admin=;|Max-Age=0/i);
  });
});

describe('admin session token', () => {
  it('rejects tampered, expired and malformed tokens', async () => {
    const good = await signAdminSession(SECRET);
    expect(await verifyAdminSession(SECRET, good)).toBe(true);
    const [exp, nonce, sig] = good.split('.');
    expect(await verifyAdminSession(SECRET, `${Number(exp) + 1000}.${nonce}.${sig}`)).toBe(false);
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(await verifyAdminSession(SECRET, `${exp}.${nonce}.${flipped}`)).toBe(false);
    expect(await verifyAdminSession('other-secret', good)).toBe(false);
    expect(await verifyAdminSession(SECRET, 'garbage')).toBe(false);
    expect(await verifyAdminSession(SECRET, undefined)).toBe(false);
    const old = await signAdminSession(SECRET, Date.now() - 13 * 3600_000);
    expect(await verifyAdminSession(SECRET, old)).toBe(false);
  });

  it('the page rejects tampered and expired cookies', async () => {
    const good = await signAdminSession(SECRET);
    const [exp, nonce, sig] = good.split('.');
    const expired = await signAdminSession(SECRET, Date.now() - 13 * 3600_000);
    for (const bad of [`${Number(exp) + 9999}.${nonce}.${sig}`, expired]) {
      const res = await app('/admin/moderation', { redirect: 'manual', headers: { Cookie: `ss_admin=${bad}` } });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/admin/login');
    }
  });
});

describe('admin moderation page', () => {
  it('redirects to login without a cookie', async () => {
    const res = await app('/admin/moderation', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin/login');
  });

  it('lists flagged items with the event detail, noindex and no-store', async () => {
    const ev = await seedFlagged('list');
    const cookie = await adminCookie();
    const res = await app('/admin/moderation', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('noindex');
    expect(html).toContain(ev.title);
    expect(html).toContain('flagged');
    expect(html).toContain(`/admin/moderation/events/${ev.id}/restore`);
    expect(html).toContain(`/admin/moderation/events/${ev.id}/remove`);
    expect(html).toContain('confirm(');
  });

  it('restore and remove work with a valid CSRF token and Origin', async () => {
    const a = await seedFlagged('restore');
    const b = await seedFlagged('remove');
    const cookie = await adminCookie();
    const csrf = await csrfOf(cookie);
    expect(csrf).not.toBe('');
    const r1 = await post(`/admin/moderation/events/${a.id}/restore`, cookie, { csrf });
    expect(r1.status).toBe(303);
    expect(await modStatus(a.id)).toBe('ok');
    const r2 = await post(`/admin/moderation/events/${b.id}/remove`, cookie, { csrf });
    expect(r2.status).toBe(303);
    expect(await modStatus(b.id)).toBe('removed');
  });

  it('rejects missing/bad CSRF, bad/missing Origin and no cookie; nothing changes', async () => {
    const ev = await seedFlagged('csrf');
    const cookie = await adminCookie();
    const csrf = await csrfOf(cookie);
    const path = `/admin/moderation/events/${ev.id}/remove`;
    expect((await post(path, cookie, {})).status).toBe(403);
    expect((await post(path, cookie, { csrf: 'deadbeef' })).status).toBe(403);
    expect((await post(path, cookie, { csrf }, 'https://evil.example')).status).toBe(403);
    expect((await post(path, cookie, { csrf }, null)).status).toBe(403);
    const anon = await app(path, { method: 'POST', redirect: 'manual', headers: { ...form, Origin: BASE }, body: `csrf=${csrf}` });
    expect(anon.status).toBe(302);
    // A CSRF token from another session is not valid for this one.
    const other = await signAdminSession(SECRET);
    const otherCsrf = await csrfOf(`ss_admin=${other}`);
    expect((await post(path, cookie, { csrf: otherCsrf })).status).toBe(403);
    expect(await modStatus(ev.id)).toBe('flagged');
  });
});

describe('robots and digest', () => {
  it('robots disallows /admin', async () => {
    expect(await (await app('/robots.txt')).text()).toContain('Disallow: /admin');
  });

  it('the digest email links to the admin page', async () => {
    const ev = await seedFlagged('digest');
    // The digest skips fixture-domain hosts: re-home this host onto a real-looking domain, purge after.
    const [{ host_id }] = (await sql()`SELECT host_id FROM events WHERE id = ${ev.id}`) as { host_id: string }[];
    const email = `adm-digest-${TS}@digest-fixture.example.com`;
    await sql()`UPDATE users SET email = ${email} WHERE id = ${host_id}`;
    await sql()`UPDATE "user" SET email = ${email} WHERE id = ${host_id}`;
    const day = new Date(Date.UTC(2091, TS % 12, 1 + (TS % 27)));
    const dayStr = day.toISOString().slice(0, 10);
    try {
      await sql()`DELETE FROM moderation_digests WHERE day = ${dayStr}`;
      const e = { ...env, RESEND_API_KEY: 'test-resend-key', PUBLIC_BASE_URL: 'https://spotseek.app' } as unknown as Env;
      expect(await runModerationDigest(e, day)).toBe('sent');
      const mail = JSON.stringify(sentEmails.find((m) => m.to === 'hello@spotseek.app'));
      expect(mail).toContain('https://spotseek.app/admin/moderation');
      expect(mail).not.toContain('/api/admin/moderation/queue');
    } finally {
      await sql()`DELETE FROM moderation_digests WHERE day = ${dayStr}`;
      await sql()`DELETE FROM moderation_events WHERE event_id IN (SELECT id FROM events WHERE host_id = ${host_id})`;
      await sql()`DELETE FROM events WHERE host_id = ${host_id}`;
      await sql()`DELETE FROM users WHERE id = ${host_id}`;
      await sql()`DELETE FROM "user" WHERE id = ${host_id}`;
    }
  });
});

describe('failed admin login tracking and alert', () => {
  const alertEnv = { ...env, RESEND_API_KEY: 'test-resend-key' };
  const fail = (ip: string) =>
    app('/admin/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { ...form, 'cf-connecting-ip': ip },
      body: new URLSearchParams({ secret: 'wrong-secret-value' }).toString(),
    }, alertEnv);
  const alerts = () => sentEmails.filter((m) => m.subject === 'Admin sign-in: 5 failed attempts in the last hour');
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Dev DB only: the counts are global, so start from empty tables.
    await sql()`DELETE FROM admin_login_failures`;
    await sql()`DELETE FROM admin_login_alerts`;
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    warn.mockRestore();
    await sql()`DELETE FROM admin_login_failures`;
    await sql()`DELETE FROM admin_login_alerts`;
  });

  it('logs a failure with ip and count, never the submitted secret', async () => {
    const ip = freshIp();
    expect((await fail(ip)).status).toBe(401);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain(`[ADMIN] failed login ip=${ip} count=1`);
    expect(lines.join('\n')).not.toContain('wrong-secret-value');
    expect(alerts()).toHaveLength(0);
  });

  it('the 5th failure in an hour sends exactly one alert; the 6th sends none', async () => {
    for (let i = 0; i < 4; i++) await fail(freshIp());
    expect(alerts()).toHaveLength(0);
    await fail(freshIp());
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].to).toBe('hello@spotseek.app');
    await fail(freshIp());
    expect(alerts()).toHaveLength(1);
  });

  it('a successful login is not counted', async () => {
    const res = await app('/admin/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { ...form, 'cf-connecting-ip': freshIp() },
      body: new URLSearchParams({ secret: SECRET }).toString(),
    }, alertEnv);
    expect(res.status).toBe(303);
    const rows = await sql()`SELECT count(*)::int AS n FROM admin_login_failures`;
    expect(rows[0].n).toBe(0);
  });
});
