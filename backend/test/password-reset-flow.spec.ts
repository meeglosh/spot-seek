/**
 * Forgot-password end-to-end against Better Auth: request (neutral response),
 * email sent via Resend (mocked), reset with the emailed token, old password
 * dead, rate limit. Timestamp-unique fixtures (shared dev DB).
 */
import { SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { __setTestResendKey } from '../src/password-reset';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const OLD_PW = 'Old_Password_123!';
const NEW_PW = 'Brand_New_Pass_456!';
const EMAIL = `pwreset-${TS}@spotseek.test`;

interface ResendBody { to: string; subject: string; html: string; text: string; reply_to: string }
const sent: ResendBody[] = [];

beforeAll(() => {
  __setTestResendKey('re_test_key');
  fetchMock.activate();
  // Unmatched requests (Neon, Better Auth) fall through to the real network; only
  // Resend is intercepted, and every call is captured.
  fetchMock
    .get('https://api.resend.com')
    .intercept({ path: '/emails', method: 'POST' })
    .reply(200, (opts) => {
      sent.push(JSON.parse(String(opts.body)) as ResendBody);
      return { id: 're_mock' };
    })
    .persist();
});

afterAll(() => __setTestResendKey(null));

const requestReset = (email: string, headers: Record<string, string> = {}) =>
  SELF.fetch(`${AUTH}/request-password-reset`, {
    method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify({ email }),
  });

const emailsTo = (email: string) => sent.filter((m) => m.to === email);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForEmail(email: string, count = 1) {
  for (let i = 0; i < 60 && emailsTo(email).length < count; i++) await sleep(250);
  return emailsTo(email);
}

function tokenFrom(msg: ResendBody): string {
  const m = /reset-password\?token=([^"&\s]+)/.exec(msg.html);
  expect(m).not.toBeNull();
  return decodeURIComponent(m![1]);
}

let oldCookie = '';

describe('forgot password', () => {
  it('setup: user exists with an active session', async () => {
    const up = await SELF.fetch(`${AUTH}/sign-up/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: OLD_PW, name: 'Reset Me' }),
    });
    expect(up.status).toBe(200);
    const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: OLD_PW }),
    });
    oldCookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    expect(oldCookie).toContain('better-auth.session_token');
  });

  it('returns the identical neutral response for a known and an unknown email', async () => {
    const known = await requestReset(EMAIL);
    const unknown = await requestReset(`nobody-${TS}@spotseek.test`);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const kBody = await known.json();
    const uBody = await unknown.json();
    expect(kBody).toEqual(uBody);
    expect(JSON.stringify(kBody)).not.toContain(EMAIL);
  });

  it('sends the branded reset email for a known email only', async () => {
    const [msg] = await waitForEmail(EMAIL);
    expect(msg).toBeDefined();
    expect(msg.subject).toBe('Reset your password');
    expect(msg.reply_to).toBe('hello@spotseek.app');
    expect(msg.html).toContain('RESET YOUR PASSWORD');
    expect(msg.html).toContain('RESET PASSWORD');
    expect(msg.html).toMatch(/href="https?:\/\/[^"]+\/reset-password\?token=[^"]+"/);
    expect(msg.text).toContain('/reset-password?token=');
    expect(msg.text).toContain('60 minutes');
    // Give a stray send for the unknown address time to (not) appear.
    await sleep(1500);
    expect(emailsTo(`nobody-${TS}@spotseek.test`)).toHaveLength(0);
  });

  it('rejects a bad token and a too-short password', async () => {
    const bad = await SELF.fetch(`${AUTH}/reset-password`, {
      method: 'POST', headers: json, body: JSON.stringify({ newPassword: NEW_PW, token: 'not-a-real-token' }),
    });
    expect(bad.status).toBe(400);
    const token = tokenFrom(emailsTo(EMAIL)[0]);
    const short = await SELF.fetch(`${AUTH}/reset-password`, {
      method: 'POST', headers: json, body: JSON.stringify({ newPassword: 'short', token }),
    });
    expect(short.status).toBe(400);
    // The failed short attempt must not have consumed the token.
    const page = await SELF.fetch(`${BASE}/reset-password?token=${encodeURIComponent(token)}`);
    expect(await page.text()).toContain(`data-token="${token}"`);
  });

  it('completing the reset: new password signs in, old one fails, token is single-use, old sessions revoked', async () => {
    const token = tokenFrom(emailsTo(EMAIL)[0]);
    const done = await SELF.fetch(`${AUTH}/reset-password`, {
      method: 'POST', headers: json, body: JSON.stringify({ newPassword: NEW_PW, token }),
    });
    expect(done.status).toBe(200);

    const withNew = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: NEW_PW }),
    });
    expect(withNew.status).toBe(200);
    const withOld = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: OLD_PW }),
    });
    expect(withOld.status).not.toBe(200);

    const reuse = await SELF.fetch(`${AUTH}/reset-password`, {
      method: 'POST', headers: json, body: JSON.stringify({ newPassword: 'Another_Pass_789!', token }),
    });
    expect(reuse.status).toBe(400);

    const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: oldCookie } });
    const body = (await sess.json()) as { user?: unknown } | null;
    expect(body?.user ?? null).toBeNull();
  });

  it('request-password-reset is rate limited per IP (AUTH_LIMITER, 10/min)', async () => {
    const ip = `203.0.113.${(TS % 200) + 20}`;
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await requestReset(`nobody-rl-${TS}@spotseek.test`, { 'cf-connecting-ip': ip });
      statuses.push(res.status);
      if (res.status === 429) break;
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);
  }, 60_000);
});
