/**
 * Resend quota guard (src/email-guard.ts, enforced inside sendEmail).
 * fetch is stubbed for every send test, so no request can reach api.resend.com;
 * the per-day counter is replaced by an in-memory one via the test hook so the
 * real email_send_counts day row is never touched. The one DB test uses a
 * far-past day key and cleans it up.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { sendEmail } from '../src/reminders';
import {
  configureEmailGuard,
  __setEmailGuardTestHooks,
  reserveEmailSlot,
  isReservedEmailDomain,
  matchesAllowlist,
  parseAllowlist,
} from '../src/email-guard';

let fetchMock: ReturnType<typeof vi.fn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let counter: number;

const send = (to: string) => sendEmail(to, 'Subj', 'Body', 'key_test_mocked');
const resendCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('https://api.resend.com/'));
const logged = (needle: string) => logSpy.mock.calls.filter((c) => String(c[0]).includes(needle)).length;

beforeEach(() => {
  counter = 0;
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  __setEmailGuardTestHooks({ reserve: async () => ++counter });
  configureEmailGuard({ DATABASE_URL: env.DATABASE_URL, EMAIL_DAILY_CAP: '80' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setEmailGuardTestHooks(null);
});

describe('email guard: reserved / test domains', () => {
  it('suppresses test domains without calling Resend or using a slot', async () => {
    for (const to of [
      'a@spotseek.test', 'a@foo.example', 'a@bar.invalid', 'a@x.localhost',
      'a@example.com', 'a@example.org', 'a@EXAMPLE.NET', 'Name <a@sub.spotseek.test>',
    ]) {
      await send(to);
    }
    expect(resendCalls()).toHaveLength(0);
    expect(logged('[EMAIL SUPPRESSED test-domain]')).toBe(8);
    expect(counter).toBe(0);
  });

  it('does not over-match look-alike real domains', () => {
    expect(isReservedEmailDomain('a@notexample.com')).toBe(false);
    expect(isReservedEmailDomain('a@mytest.io')).toBe(false);
    expect(isReservedEmailDomain('a@gmail.com')).toBe(false);
    expect(isReservedEmailDomain('not-an-address')).toBe(true);
  });
});

describe('email guard: daily cap', () => {
  it('lets N sends through and blocks send number N+1 (logging the cap once per request)', async () => {
    configureEmailGuard({ DATABASE_URL: env.DATABASE_URL, EMAIL_DAILY_CAP: '3' });
    for (let i = 0; i < 3; i++) await send(`fan${i}@gmail.com`);
    expect(resendCalls()).toHaveLength(3);
    await send('fan3@gmail.com');
    await send('fan4@gmail.com');
    expect(resendCalls()).toHaveLength(3);
    expect(logged('[EMAIL SUPPRESSED daily-cap]')).toBe(1);

    // A new request (configureEmailGuard) logs it again.
    configureEmailGuard({ DATABASE_URL: env.DATABASE_URL, EMAIL_DAILY_CAP: '3' });
    await send('fan5@gmail.com');
    expect(logged('[EMAIL SUPPRESSED daily-cap]')).toBe(2);
    expect(resendCalls()).toHaveLength(3);
  });

  it('defaults the cap to 80 when the var is absent', async () => {
    configureEmailGuard({ DATABASE_URL: env.DATABASE_URL });
    counter = 79;
    await send('fan@gmail.com'); // slot 80 -> allowed
    await send('fan@gmail.com'); // slot 81 -> blocked
    expect(resendCalls()).toHaveLength(1);
  });

  it('fails closed when the counter is unreachable', async () => {
    __setEmailGuardTestHooks({ reserve: async () => { throw new Error('db down'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await send('fan@gmail.com');
    expect(resendCalls()).toHaveLength(0);
  });

  it('the SQL reserve is an atomic increment (real dev DB, isolated day key)', async () => {
    vi.unstubAllGlobals(); // real network for Neon; this path never calls Resend
    const day = '2000-01-01';
    const sql = neon(env.DATABASE_URL);
    await sql`DELETE FROM email_send_counts WHERE day = ${day}`;
    try {
      const counts = await Promise.all([1, 2, 3, 4, 5].map(() => reserveEmailSlot(env.DATABASE_URL, day)));
      expect([...counts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await sql`DELETE FROM email_send_counts WHERE day = ${day}`;
    }
  }, 30_000);
});

describe('email guard: allowlist', () => {
  it('suppresses recipients that do not match a set allowlist (no slot used)', async () => {
    configureEmailGuard({ DATABASE_URL: env.DATABASE_URL, EMAIL_ALLOWLIST: 'owner@gmail.com, @mycompany.com' });
    await send('stranger@gmail.com');
    expect(resendCalls()).toHaveLength(0);
    expect(logged('[EMAIL SUPPRESSED allowlist]')).toBe(1);
    expect(counter).toBe(0);
  });

  it('sends to exact-address and @domain matches', async () => {
    configureEmailGuard({ DATABASE_URL: env.DATABASE_URL, EMAIL_ALLOWLIST: 'Owner@gmail.com, @mycompany.com' });
    await send('owner@gmail.com');
    await send('anyone@mycompany.com');
    expect(resendCalls()).toHaveLength(2);
  });

  it('is off by default and ignores blank values', () => {
    expect(parseAllowlist(undefined)).toBeNull();
    expect(parseAllowlist(' , ')).toBeNull();
    expect(matchesAllowlist('a@b.com', ['@b.com'])).toBe(true);
    expect(matchesAllowlist('a@sub.b.com', ['@b.com'])).toBe(false);
  });
});

describe('email guard: normal send', () => {
  it('sends a normal address under the cap exactly once to Resend (mocked)', async () => {
    await send('fan@gmail.com');
    expect(resendCalls()).toHaveLength(1);
    const [url, init] = resendCalls()[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(String(init.body)).to).toBe('fan@gmail.com');
    expect(counter).toBe(1);
  });
});
