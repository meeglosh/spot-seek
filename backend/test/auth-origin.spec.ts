/**
 * Better Auth origin/CSRF posture: native (bearer, no Origin) requests work, cookie-based
 * browser POSTs are origin-checked against trustedOrigins, and baseURL is always set
 * (no "Base URL is not set" warning). Timestamp-unique fixtures (shared dev DB).
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const json = { 'Content-Type': 'application/json' };
const EMAIL = `origin-${Date.now()}@spotseek.test`;
const PW = 'Origin_Test_Pass_123!';

let token = '';
let cookie = '';
const logged: string[] = [];
const spies: Array<{ mockRestore: () => void }> = [];

beforeAll(() => {
  for (const m of ['warn', 'error', 'log', 'info'] as const) {
    spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')); }));
  }
});
afterAll(() => spies.forEach((s) => s.mockRestore()));

describe('native client (no Origin, bearer token)', () => {
  it('sign-up succeeds and returns a bearer token in the body', async () => {
    const res = await SELF.fetch(`${AUTH}/sign-up/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: PW, name: 'Origin Test' }),
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { token?: string };
    expect(b.token).toBeTruthy();
    token = b.token!;
  });

  it('sign-in succeeds with no Origin and captures the cookie for later cases', async () => {
    const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    expect(res.status).toBe(200);
    token = ((await res.json()) as { token: string }).token;
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(cookie).toContain('better-auth.session_token');
  });

  it('get-session with a bearer token succeeds', async () => {
    const res = await SELF.fetch(`${AUTH}/get-session`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user?: { email: string } }).user?.email).toBe(EMAIL);
  });

  it('a cookie-jar replay with no Origin/Referer/Sec-Fetch (non-browser) is not CSRF-rejected', async () => {
    const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    expect(res.status).toBe(200);
  });
});

describe('browser (cookie) requests keep CSRF protection', () => {
  const signOut = (headers: Record<string, string>) =>
    SELF.fetch(`${AUTH}/sign-out`, { method: 'POST', headers: { ...json, Cookie: cookie, ...headers }, body: '{}' });

  it('rejects a cookie POST from an untrusted Origin', async () => {
    expect((await signOut({ Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('rejects a cookie POST with Origin "null"', async () => {
    expect((await signOut({ Origin: 'null' })).status).toBe(403);
  });

  it('rejects a cookie POST from a browser (Sec-Fetch-Site) that sends no Origin', async () => {
    expect((await signOut({ 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' })).status).toBe(403);
  });

  it('rejects an untrusted Origin on a cookieless sign-in POST too', async () => {
    const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
      method: 'POST', headers: { ...json, Origin: 'https://evil.example' }, body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    expect(res.status).toBe(403);
  });

  it.each(['https://spotseek.app', 'https://www.spotseek.app', 'https://spot-seek-api.dry-base-037d.workers.dev'])(
    'accepts a POST from trusted origin %s',
    async (origin) => {
      const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
        method: 'POST', headers: { ...json, Origin: origin }, body: JSON.stringify({ email: EMAIL, password: PW }),
      });
      expect(res.status).toBe(200);
    },
  );

  it('accepts a cookie sign-out from https://spotseek.app', async () => {
    expect((await signOut({ Origin: 'https://spotseek.app' })).status).toBe(200);
  });
});

describe('config warnings', () => {
  it('never logs "Base URL is not set" nor the disableOriginCheck deprecation', async () => {
    // A session-lookup call site (createAuth without opts) must also have a baseURL.
    const r = await SELF.fetch('https://example.com/api/favourites', { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBeLessThan(500);
    const text = logged.join('\n');
    expect(text).not.toContain('Base URL is not set');
    expect(text).not.toContain('disableOriginCheck');
  });
});
