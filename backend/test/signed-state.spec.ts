import { describe, it, expect } from 'vitest';
import { signState, verifyState } from '../src/signed-state';

const SECRET = 'unit-test-secret';
const P = 'purpose-a-v1';

describe('signState / verifyState', () => {
  it('round-trips a payload', async () => {
    const t = await signState(SECRET, P, { userId: 'u1', accountId: 'acct_1' }, 60);
    expect(t).toMatch(/^\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(await verifyState(SECRET, P, t)).toEqual({ userId: 'u1', accountId: 'acct_1' });
  });

  it('rejects a different purpose, a different secret, and missing/malformed tokens', async () => {
    const t = await signState(SECRET, P, { a: 1 }, 60);
    expect(await verifyState(SECRET, 'purpose-b-v1', t)).toBeNull();
    expect(await verifyState('other-secret', P, t)).toBeNull();
    expect(await verifyState(SECRET, P, undefined)).toBeNull();
    expect(await verifyState(SECRET, P, '')).toBeNull();
    expect(await verifyState(SECRET, P, 'a.b')).toBeNull();
    expect(await verifyState(SECRET, P, 'x.y.z')).toBeNull();
  });

  it('rejects a tampered payload, expiry or signature', async () => {
    const t = await signState(SECRET, P, { a: 1 }, 60);
    const [exp, body, sig] = t.split('.');
    const other = btoa(JSON.stringify({ a: 2 })).replace(/=+$/, '');
    expect(await verifyState(SECRET, P, `${exp}.${other}.${sig}`)).toBeNull();
    expect(await verifyState(SECRET, P, `${Number(exp) + 1000}.${body}.${sig}`)).toBeNull();
    expect(await verifyState(SECRET, P, `${exp}.${body}.${'0'.repeat(64)}`)).toBeNull();
  });

  it('rejects an expired token and accepts it just before expiry', async () => {
    const now = 1_700_000_000_000;
    const t = await signState(SECRET, P, { a: 1 }, 60, now);
    expect(await verifyState(SECRET, P, t, now + 59_000)).toEqual({ a: 1 });
    expect(await verifyState(SECRET, P, t, now + 60_000)).toBeNull();
    expect(await verifyState(SECRET, P, t, now + 3_600_000)).toBeNull();
  });
});
