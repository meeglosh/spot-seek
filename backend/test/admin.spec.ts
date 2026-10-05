import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const PROFILES = 'https://example.com/api/profiles';
const ADMIN = 'https://example.com/api/admin';

const TS = Date.now();
const ADMIN_SECRET = 'test-admin-secret';

async function signUp() {
  const email = `admin-test-${TS}@spotseek.test`;
  const pw = 'Admin_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: 'VerifyMe' }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = await sess.json() as { user: { id: string } };
  return user.id;
}

let userId: string;

beforeAll(async () => { userId = await signUp(); });

describe('host verification', () => {
  it('admin endpoint rejects a wrong bearer with 401 (test env provides ADMIN_SECRET via vitest.config.mts)', async () => {
    const res = await SELF.fetch(`${ADMIN}/verify/${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_SECRET}-wrong` },
    });
    expect(res.status).toBe(401);
  });

  it('public profile shows isVerified field', async () => {
    const res = await SELF.fetch(`${PROFILES}/${userId}`);
    const { user } = await res.json() as { user: Record<string, unknown> };
    expect('isVerified' in user).toBe(true);
    expect(user.isVerified).toBe(false);
  });
});
