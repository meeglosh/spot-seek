/**
 * Sponsorship status machine (PATCH /api/sponsors/bids/:id), webhook/sweep
 * guards and event-delete protection (owner decisions 2026-10-18).
 *
 * Money code, test mode only: Stripe is never reached. Outbound calls to
 * api.stripe.com are intercepted with fetchMock and the key is a fake injected
 * with __setTestStripeConfig(), exactly like test/payments.spec.ts.
 */
import { SELF, fetchMock, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { __setTestStripeConfig } from '../src/payments';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const SPONSORS = 'https://example.com/api/sponsors';
const PAYMENTS = 'https://example.com/api/payments';

const TS = Date.now();
const HOUR = 60 * 60 * 1000;
const pastIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const futureIso = (msAhead: number) => new Date(Date.now() + msAhead).toISOString();

const WEBHOOK_SECRET = 'whsec_fake_secret';

// Every test signs up real users against the Neon dev branch; allow for latency.
vi.setConfig({ testTimeout: 60_000 });

async function signIn(suffix: string) {
  const email = `sst-${suffix}-${TS}@spotseek.test`;
  const pw = 'Sst_Pwd_1!';
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

const json = (cookie: string) => ({ 'Content-Type': 'application/json', Cookie: cookie });

async function createEvent(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: json(cookie),
    body: JSON.stringify({ title: 'Sponsorship States Event', broadcastSubject: 'Hockey', status: 'published', ...overrides }),
  });
  return ((await res.json()) as { event: { id: string } }).event;
}

async function whileOpen<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  const sql = neon(env.DATABASE_URL);
  const [orig] = await sql`SELECT starts_at, ends_at FROM events WHERE id = ${eventId}`;
  await sql`UPDATE events SET starts_at = now() + interval '1 day', ends_at = now() + interval '2 days' WHERE id = ${eventId}`;
  try {
    return await fn();
  } finally {
    await sql`UPDATE events SET starts_at = ${orig.starts_at}, ends_at = ${orig.ends_at} WHERE id = ${eventId}`;
  }
}

function stripeSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function fireWebhook(payload: unknown) {
  const body = JSON.stringify(payload);
  return SELF.fetch(`${PAYMENTS}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripeSignatureHeader(body, WEBHOOK_SECRET) },
    body,
  });
}

function mockStripe(path: string, response: Record<string, unknown>) {
  fetchMock.get('https://api.stripe.com').intercept({ path, method: 'POST' }).reply(200, response);
}

// Intercepts POST /v1/refunds and counts how often it is hit.
function mockRefund(id: string) {
  const calls = { n: 0 };
  fetchMock.get('https://api.stripe.com').intercept({ path: '/v1/refunds', method: 'POST' }).reply(200, () => {
    calls.n += 1;
    return { id };
  });
  return calls;
}

const mockCancelPi = (piId: string, status = 'canceled') => mockStripe(`/v1/payment_intents/${piId}/cancel`, { id: piId, status });

const patchBid = (cookie: string, bidId: string, status: string) =>
  SELF.fetch(`${SPONSORS}/bids/${bidId}`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify({ status }) });

const sql = () => neon(env.DATABASE_URL);
async function rowOf(bidId: string) {
  const [r] = await sql()`SELECT status, payment_status AS "paymentStatus" FROM sponsorships WHERE id = ${bidId}`;
  return r as { status: string; paymentStatus: string } | undefined;
}

type Fixture = { host: { cookie: string; id: string }; sponsor: { cookie: string; id: string }; eventId: string; bidId: string; piId: string };

// A sponsor bid on a fresh event. `stage`: 'pending' | 'accepted' (requires_payment,
// PaymentIntent created) | 'paid' (webhook processed).
async function fixture(tag: string, stage: 'pending' | 'accepted' | 'paid', eventOverrides: Record<string, unknown> = {}): Promise<Fixture> {
  const host = await signIn(`${tag}-host`);
  const sponsor = await signIn(`${tag}-sponsor`);
  await SELF.fetch(`${SPONSORS}/register`, { method: 'POST', headers: json(sponsor.cookie), body: JSON.stringify({ companyName: `Sst ${tag} Co` }) });
  const event = await createEvent(host.cookie, eventOverrides);
  const piId = `pi_sst_${tag}_${TS}`;
  const bidId = await whileOpen(event.id, async () => {
    const bidRes = await SELF.fetch(`${SPONSORS}/bids`, {
      method: 'POST', headers: json(sponsor.cookie), body: JSON.stringify({ eventId: event.id, amountCents: 9000 }),
    });
    const { bid } = await bidRes.json() as { bid: { id: string } };
    if (stage !== 'pending') expect((await patchBid(host.cookie, bid.id, 'active')).status).toBe(200);
    return bid.id;
  });
  if (stage !== 'pending') {
    mockStripe('/v1/payment_intents', { id: piId, client_secret: `${piId}_secret` });
    const pay = await SELF.fetch(`${PAYMENTS}/sponsorships/${bidId}/pay`, { method: 'POST', headers: { Cookie: sponsor.cookie } });
    expect(pay.status).toBe(200);
  }
  if (stage === 'paid') {
    const wh = await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: piId, metadata: { sponsorshipId: bidId } } } });
    expect(wh.status).toBe(200);
    expect(await rowOf(bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
  }
  return { host, sponsor, eventId: event.id, bidId, piId };
}

beforeAll(() => {
  fetchMock.activate();
  __setTestStripeConfig({ secretKey: 'sk_test_fake_key', webhookSecret: WEBHOOK_SECRET });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const INVALID = { error: 'invalid_transition' };

describe('transition table: pending', () => {
  it('pending -> active by the reviewer sets requires_payment', async () => {
    const f = await fixture('p-act', 'pending');
    const res = await whileOpen(f.eventId, () => patchBid(f.host.cookie, f.bidId, 'active'));
    expect(res.status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });
  });

  it('pending -> rejected by the reviewer', async () => {
    const f = await fixture('p-rej', 'pending');
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'rejected', paymentStatus: 'unpaid' });
  });

  it('pending -> cancelled by the initiator', async () => {
    const f = await fixture('p-can', 'pending');
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('refuses the wrong party: initiator cannot accept/reject, reviewer cannot cancel (400)', async () => {
    const f = await fixture('p-wrong', 'pending');
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'active')).status).toBe(400);
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'rejected')).status).toBe(400);
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(400);
    expect(await rowOf(f.bidId)).toEqual({ status: 'pending', paymentStatus: 'unpaid' });
  });

  it('pending -> active is refused once the party has ended (event_ended)', async () => {
    const f = await fixture('p-ended', 'pending');
    await sql()`UPDATE events SET starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours' WHERE id = ${f.eventId}`;
    const res = await patchBid(f.host.cookie, f.bidId, 'active');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'event_ended' });
  });

  it('pending with a payment state already set cannot be activated (409)', async () => {
    const f = await fixture('p-pay', 'pending');
    await sql()`UPDATE sponsorships SET payment_status = 'paid' WHERE id = ${f.bidId}`;
    const res = await whileOpen(f.eventId, () => patchBid(f.host.cookie, f.bidId, 'active'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(INVALID);
    expect(await rowOf(f.bidId)).toEqual({ status: 'pending', paymentStatus: 'paid' });
  });
});

describe('transition table: terminal and frozen rows', () => {
  it('rejected and cancelled are terminal: no re-activation or any change (409)', async () => {
    const f = await fixture('term', 'pending');
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    for (const status of ['active', 'rejected', 'cancelled']) {
      for (const who of [f.host, f.sponsor]) {
        const res = await whileOpen(f.eventId, () => patchBid(who.cookie, f.bidId, status));
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual(INVALID);
      }
    }
    const g = await fixture('term2', 'pending');
    expect((await patchBid(g.sponsor.cookie, g.bidId, 'cancelled')).status).toBe(200);
    const res = await whileOpen(g.eventId, () => patchBid(g.host.cookie, g.bidId, 'active'));
    expect(res.status).toBe(409);
    expect(await rowOf(g.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('released rows refuse any change (409); refunded rows refuse any change (409)', async () => {
    const f = await fixture('frozen', 'accepted');
    for (const [ps, err] of [['released', 'already_released'], ['refunded', 'invalid_transition']] as const) {
      await sql()`UPDATE sponsorships SET payment_status = ${ps} WHERE id = ${f.bidId}`;
      for (const status of ['active', 'rejected', 'cancelled']) {
        for (const who of [f.host, f.sponsor]) {
          const res = await patchBid(who.cookie, f.bidId, status);
          expect(res.status).toBe(409);
          expect(await res.json()).toEqual({ error: err });
        }
      }
      expect((await rowOf(f.bidId))?.paymentStatus).toBe(ps);
    }
  });

  it('active is never set again on a row with payment state: paid stays paid (409)', async () => {
    const f = await fixture('noover', 'paid');
    for (const who of [f.host, f.sponsor]) {
      const res = await patchBid(who.cookie, f.bidId, 'active');
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual(INVALID);
    }
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
  });

  it('active -> rejected by the non-reviewer is not listed (409)', async () => {
    const f = await fixture('norej', 'accepted');
    const res = await patchBid(f.sponsor.cookie, f.bidId, 'rejected');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(INVALID);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });
  });

  it('unknown status values are a 400', async () => {
    const f = await fixture('unk', 'pending');
    expect((await patchBid(f.host.cookie, f.bidId, 'pending')).status).toBe(400);
    expect((await patchBid(f.host.cookie, f.bidId, 'bogus')).status).toBe(400);
  });
});

describe('active + requires_payment', () => {
  it('cancelled by the sponsor: PaymentIntent cancelled, paymentStatus unpaid', async () => {
    const f = await fixture('rp-sc', 'accepted');
    mockCancelPi(f.piId);
    const res = await patchBid(f.sponsor.cookie, f.bidId, 'cancelled');
    expect(res.status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('cancelled by the host: PaymentIntent cancelled, paymentStatus unpaid', async () => {
    const f = await fixture('rp-hc', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('rejected by the reviewer (host): PaymentIntent cancelled, status rejected, unpaid', async () => {
    const f = await fixture('rp-hr', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'rejected', paymentStatus: 'unpaid' });
  });

  it('PaymentIntent already succeeded: 409 payment_in_progress, row untouched', async () => {
    const f = await fixture('rp-inprog', 'accepted');
    mockCancelPi(f.piId, 'succeeded');
    const res = await patchBid(f.host.cookie, f.bidId, 'cancelled');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'payment_in_progress' });
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });
  });
});

describe('active + paid', () => {
  it('host cancels before start: one full refund, refunded', async () => {
    const f = await fixture('hostbefore', 'paid', { startsAt: futureIso(48 * HOUR) });
    const refunds = mockRefund('re_sst_hb');
    const res = await patchBid(f.host.cookie, f.bidId, 'cancelled');
    expect(res.status).toBe(200);
    const { bid } = await res.json() as { bid: { status: string; paymentStatus: string } };
    expect(bid.status).toBe('cancelled');
    expect(bid.paymentStatus).toBe('refunded');
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'refunded' });
  });

  it('host rejects before start (sponsor-initiated bid is hosts to review): refunded', async () => {
    const f = await fixture('hostrej', 'paid', { startsAt: futureIso(48 * HOUR) });
    const refunds = mockRefund('re_sst_hr');
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'rejected', paymentStatus: 'refunded' });
  });

  it('host cancels or rejects after start: 403 cancel_event_instead, no refund, still paid', async () => {
    const f = await fixture('hostafter', 'paid', { startsAt: pastIso(HOUR), endsAt: futureIso(2 * HOUR) });
    // No /v1/refunds interceptor: any refund call would fail the request.
    for (const status of ['cancelled', 'rejected']) {
      const res = await patchBid(f.host.cookie, f.bidId, status);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'cancel_event_instead' });
    }
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
  });

  it('sponsor withdrawing keeps the existing rule: refunded before start, 403 refund_window_closed after', async () => {
    const before = await fixture('spbefore', 'paid', { startsAt: futureIso(48 * HOUR) });
    const refunds = mockRefund('re_sst_sb');
    expect((await patchBid(before.sponsor.cookie, before.bidId, 'cancelled')).status).toBe(200);
    expect(refunds.n).toBe(1);
    expect(await rowOf(before.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'refunded' });

    const after = await fixture('spafter', 'paid', { startsAt: pastIso(HOUR), endsAt: futureIso(2 * HOUR) });
    const res = await patchBid(after.sponsor.cookie, after.bidId, 'cancelled');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refund_window_closed' });
  });
});

describe('webhook guards', () => {
  it('payment succeeding on a cancelled row refunds it and does not mark it paid', async () => {
    const f = await fixture('wh-cancelled', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);

    const refunds = mockRefund('re_sst_whc');
    const wh = await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: f.piId, metadata: { sponsorshipId: f.bidId } } } });
    expect(wh.status).toBe(200);
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'refunded' });

    // Redelivery is a no-op (no second refund interceptor registered).
    expect((await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: f.piId, metadata: { sponsorshipId: f.bidId } } } })).status).toBe(200);
    expect(refunds.n).toBe(1);
  });

  it('payment succeeding on a rejected row refunds it', async () => {
    const f = await fixture('wh-rejected', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    const refunds = mockRefund('re_sst_whr');
    const wh = await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: f.piId, metadata: { sponsorshipId: f.bidId } } } });
    expect(wh.status).toBe(200);
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'rejected', paymentStatus: 'refunded' });
  });

  it('missing sponsorship: logs loudly with the id and does not throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ghost = crypto.randomUUID();
    const wh = await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_ghost', metadata: { sponsorshipId: ghost } } } });
    expect(wh.status).toBe(200);
    expect(errSpy.mock.calls.some((args) => args.map(String).join(' ').includes(ghost))).toBe(true);
  });
});

describe('sweep guards', () => {
  it('a paid but non-active row is refunded, not released', async () => {
    // Event ended >24h ago and the host has payouts enabled: the release
    // conditions are all met, so only the status guard stands in the way.
    const f = await fixture('sweep', 'paid', { startsAt: pastIso(26 * HOUR), endsAt: pastIso(25 * HOUR) });
    await sql()`UPDATE users SET stripe_account_id = ${`acct_sst_${TS}`}, stripe_payouts_enabled = true WHERE id = ${f.host.id}`;
    await sql()`UPDATE sponsorships SET status = 'cancelled' WHERE id = ${f.bidId}`;

    // No /v1/transfers interceptor: a release attempt would fail the call.
    const refunds = mockRefund('re_sst_sweep');
    const run = await SELF.fetch(`${PAYMENTS}/run-sweeps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-secret' },
      body: JSON.stringify({ sponsorshipIds: [f.bidId] }),
    });
    expect(run.status).toBe(200);
    expect(await run.json()).toEqual({ released: 0, refunded: 1 });
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'refunded' });
  });
});

describe('DELETE /api/events/:id with sponsorships', () => {
  const del = (cookie: string, eventId: string) => SELF.fetch(`${EVENTS}/${eventId}`, { method: 'DELETE', headers: { Cookie: cookie } });
  const eventExists = async (eventId: string) => ((await sql()`SELECT id FROM events WHERE id = ${eventId}`).length === 1);

  it('paid sponsorship: 409 has_sponsorship_history, event and rows intact', async () => {
    const f = await fixture('del-paid', 'paid', { startsAt: futureIso(48 * HOUR) });
    const res = await del(f.host.cookie, f.eventId);
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('has_sponsorship_history');
    expect(body.message).toBe('This party has sponsorship payments. Cancel it instead.');
    expect(await eventExists(f.eventId)).toBe(true);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
  });

  it('refunded / released / PI-or-transfer-bearing unpaid rows also block (money history)', async () => {
    const f = await fixture('del-hist', 'pending');
    for (const set of [
      sql()`UPDATE sponsorships SET payment_status = 'refunded' WHERE id = ${f.bidId}`,
    ]) await set;
    expect((await del(f.host.cookie, f.eventId)).status).toBe(409);
    await sql()`UPDATE sponsorships SET payment_status = 'unpaid', payment_intent_id = 'pi_old_sst' WHERE id = ${f.bidId}`;
    expect((await del(f.host.cookie, f.eventId)).status).toBe(409);
    await sql()`UPDATE sponsorships SET payment_intent_id = NULL, transfer_id = 'tr_old_sst' WHERE id = ${f.bidId}`;
    expect((await del(f.host.cookie, f.eventId)).status).toBe(409);
    expect(await eventExists(f.eventId)).toBe(true);
  });

  it('unpaid pending bid: event deleted with its sponsorship', async () => {
    const f = await fixture('del-pending', 'pending');
    const res = await del(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await eventExists(f.eventId)).toBe(false);
    expect(await rowOf(f.bidId)).toBeUndefined();
  });

  it('awaiting-payment bid: its open PaymentIntent is cancelled, then the event is deleted', async () => {
    const f = await fixture('del-open', 'accepted');
    mockCancelPi(f.piId); // one-shot interceptor: must be consumed by the delete
    const res = await del(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await eventExists(f.eventId)).toBe(false);
    expect(await rowOf(f.bidId)).toBeUndefined();
    fetchMock.assertNoPendingInterceptors();
  });

  it('awaiting-payment bid whose PaymentIntent already succeeded: 409, nothing deleted', async () => {
    const f = await fixture('del-inflight', 'accepted');
    mockCancelPi(f.piId, 'succeeded');
    const res = await del(f.host.cookie, f.eventId);
    expect(res.status).toBe(409);
    expect(await eventExists(f.eventId)).toBe(true);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });
  });
});
