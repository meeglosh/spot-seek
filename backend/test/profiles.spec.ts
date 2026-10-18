import { SELF, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const PROFILES = 'https://example.com/api/profiles';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `prof-${suffix}-${TS}@spotseek.test`;
  const pw = 'Prof_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: `Prof ${suffix}` }),
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

let alice: { cookie: string; id: string };
let bob: { cookie: string; id: string };

beforeAll(async () => {
  [alice, bob] = await Promise.all([signIn('alice'), signIn('bob')]);
});

const PRIVATE_KEYS = ['email', 'lastLat', 'lastLng', 'locationUpdatedAt', 'stripeAccountId', 'stripePayoutsEnabled', 'updatedAt'];
const PUBLIC_KEYS = ['avatarUrl', 'createdAt', 'displayName', 'id', 'isVerified'];

describe('profiles', () => {
  it('public profile, followers and following expose only allowlisted fields', async () => {
    // Dedicated users so the follow graph of alice/bob used below is untouched.
    const [carol, dave] = await Promise.all([signIn('carol'), signIn('dave')]);
    // Give carol stored location + Stripe data so a leaking projection would show it.
    const sql = neon(env.DATABASE_URL);
    await sql`UPDATE users SET last_lat = 40.7, last_lng = -74.0, location_updated_at = now(),
              stripe_account_id = 'acct_test_leak', stripe_payouts_enabled = true WHERE id = ${carol.id}`;
    await SELF.fetch(`${PROFILES}/${dave.id}/follow`, { method: 'POST', headers: { Cookie: carol.cookie } });
    await SELF.fetch(`${PROFILES}/${carol.id}/follow`, { method: 'POST', headers: { Cookie: dave.cookie } });

    const prof = await (await SELF.fetch(`${PROFILES}/${carol.id}`)).json() as { user: Record<string, unknown> };
    const frs = await (await SELF.fetch(`${PROFILES}/${dave.id}/followers`)).json() as { followers: Record<string, unknown>[] };
    const fing = await (await SELF.fetch(`${PROFILES}/${dave.id}/following`)).json() as { following: Record<string, unknown>[] };
    expect(frs.followers.some((f) => f.id === carol.id)).toBe(true);
    expect(fing.following.some((f) => f.id === carol.id)).toBe(true);

    const objs = [prof.user, ...frs.followers, ...fing.following];
    for (const o of objs) {
      expect(Object.keys(o).sort()).toEqual(PUBLIC_KEYS);
      for (const k of PRIVATE_KEYS) expect(o).not.toHaveProperty(k);
    }
    expect(JSON.stringify(objs)).not.toContain('acct_test_leak');
  });

  it('GET /profiles/:id returns public profile (no email)', async () => {
    const res = await SELF.fetch(`${PROFILES}/${alice.id}`);
    expect(res.status).toBe(200);
    const { user } = await res.json() as { user: Record<string, unknown> };
    expect(user.id).toBe(alice.id);
    expect(user.displayName).toBeDefined();
    expect(user.email).toBeUndefined();
  });

  it('POST /profiles/:id/follow creates a follow', async () => {
    const res = await SELF.fetch(`${PROFILES}/${bob.id}/follow`, {
      method: 'POST', headers: { Cookie: alice.cookie },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { followed: boolean };
    expect(body.followed).toBe(true);
  });

  it('GET /profiles/:id/followers lists alice as bobs follower', async () => {
    const res = await SELF.fetch(`${PROFILES}/${bob.id}/followers`);
    expect(res.status).toBe(200);
    const { followers } = await res.json() as { followers: Array<{ id: string }> };
    expect(followers.some((f) => f.id === alice.id)).toBe(true);
  });

  it('GET /profiles/:id/following lists bob in alices following', async () => {
    const res = await SELF.fetch(`${PROFILES}/${alice.id}/following`);
    const { following } = await res.json() as { following: Array<{ id: string }> };
    expect(following.some((f) => f.id === bob.id)).toBe(true);
  });

  it('DELETE /profiles/:id/follow removes the follow', async () => {
    await SELF.fetch(`${PROFILES}/${bob.id}/follow`, {
      method: 'DELETE', headers: { Cookie: alice.cookie },
    });
    const res = await SELF.fetch(`${PROFILES}/${bob.id}/followers`);
    const { followers } = await res.json() as { followers: Array<{ id: string }> };
    expect(followers.some((f) => f.id === alice.id)).toBe(false);
  });

  it('cannot follow yourself', async () => {
    const res = await SELF.fetch(`${PROFILES}/${alice.id}/follow`, {
      method: 'POST', headers: { Cookie: alice.cookie },
    });
    expect(res.status).toBe(400);
  });
});
