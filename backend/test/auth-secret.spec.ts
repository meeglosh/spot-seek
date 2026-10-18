/**
 * Better Auth must sign with the BETTER_AUTH_SECRET binding, never its published default
 * (Workers do not populate process.env from bindings, so the library cannot find it itself).
 * Regression: a verify-email JWT forged with the library default secret used to mint a
 * session for any user whose email was known.
 */
import { SELF, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { describe, it, expect } from 'vitest';
import { createAuth, setAuthSecret } from '../src/auth';

// Better Auth's built-in fallback secret (public, in the library source).
const LIBRARY_DEFAULT = 'better-auth-secret-12345678901234567890';
const AUTH = 'https://example.com/api/auth';
const json = { 'Content-Type': 'application/json' };

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

describe('createAuth secret handling', () => {
  // This spec file has its own module registry, so nothing has registered a secret yet.
  it('throws when no secret has been registered (fail closed)', () => {
    const sql = neon(env.DATABASE_URL);
    expect(() => createAuth(sql)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('refuses the library default secret', () => {
    setAuthSecret(LIBRARY_DEFAULT);
    expect(() => createAuth(neon(env.DATABASE_URL))).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('uses exactly the registered secret', async () => {
    setAuthSecret(env.BETTER_AUTH_SECRET);
    const ctx = await createAuth(neon(env.DATABASE_URL)).$context;
    expect(ctx.secret).toBe(env.BETTER_AUTH_SECRET);
    expect(ctx.secret).not.toBe(LIBRARY_DEFAULT);
  });
});

describe('GET /api/auth/verify-email through the Worker', () => {
  const EMAIL = `secret-${Date.now()}@spotseek.test`;

  it('rejects a token signed with the library default secret (no session minted)', async () => {
    const up = await SELF.fetch(`${AUTH}/sign-up/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: 'Secret_Test_Pass_123!', name: 'Secret Test' }),
    });
    expect(up.status).toBe(200);

    const forged = await signJwt(LIBRARY_DEFAULT, { email: EMAIL, updateTo: EMAIL, requestType: 'change-email-verification' });
    const res = await SELF.fetch(`${AUTH}/verify-email?token=${forged}`);
    expect(res.status).toBe(401);
    expect(res.headers.get('set-auth-token')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('control: the same token signed with the real binding secret is accepted', async () => {
    const good = await signJwt(env.BETTER_AUTH_SECRET!, { email: EMAIL, updateTo: EMAIL, requestType: 'change-email-verification' });
    const res = await SELF.fetch(`${AUTH}/verify-email?token=${good}`);
    expect(res.status).toBe(200);
  });
});
