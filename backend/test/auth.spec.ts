/**
 * Auth flow integration tests: sign-up, sign-in, session, sign-out.
 * These hit the live Neon dev database via the Worker's fetch handler.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const BASE = 'https://example.com/api/auth';
const TEST_EMAIL = `test-${Date.now()}@spotseek.test`;
const TEST_PASSWORD = 'Test_Password_123!';
const TEST_NAME = 'Test User';

describe('auth flow', () => {
  let sessionCookie = '';

  it('sign-up creates a new user', async () => {
    const res = await SELF.fetch(`${BASE}/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: TEST_NAME }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user?: { email: string } };
    expect(body.user?.email).toBe(TEST_EMAIL);
  });

  it('sign-in returns a session cookie', async () => {
    const res = await SELF.fetch(`${BASE}/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('better-auth.session_token');
    sessionCookie = setCookie.split(';')[0] ?? '';
  });

  it('get-session returns the authenticated user', async () => {
    const res = await SELF.fetch(`${BASE}/get-session`, {
      headers: { Cookie: sessionCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user?: { email: string } };
    expect(body.user?.email).toBe(TEST_EMAIL);
  });

  it('sign-out clears the session', async () => {
    const res = await SELF.fetch(`${BASE}/sign-out`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status).toBe(200);
  });

  it('get-session without cookie returns null', async () => {
    // Unauthenticated request — Better Auth returns null for the whole response.
    const res = await SELF.fetch(`${BASE}/get-session`);
    const body = await res.json();
    expect(body).toBeNull();
  });
});
