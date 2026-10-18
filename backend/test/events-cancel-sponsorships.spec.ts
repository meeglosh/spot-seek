/**
 * Event cancel closes sponsorship payment links (PATCH /api/events/:id with
 * status 'cancelled'), owner decision 2026-10-18.
 *
 * Money code, test mode only: Stripe is never reached. Outbound calls to
 * api.stripe.com are intercepted with fetchMock and the key is a fake injected
 * with __setTestStripeConfig(), exactly like test/sponsorship-states.spec.ts.
 */
import { SELF, fetchMock, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { __setTestStripeConfig } from '../src/payments';
import * as notifications from '../src/notifications';

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
  const email = `evc-${suffix}-${TS}@spotseek.test`;
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
  const piId = `pi_evc_${tag}_${TS}`;
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


const cancelEvent = (cookie: string, eventId: string) =>
  SELF.fetch(`${EVENTS}/${eventId}`, { method: 'PATCH', headers: json(cookie), body: JSON.stringify({ status: 'cancelled' }) });

async function eventStatus(eventId: string) {
  const [r] = await sql()`SELECT status FROM events WHERE id = ${eventId}`;
  return r.status as string;
}

beforeAll(() => {
  fetchMock.activate();
  __setTestStripeConfig({ secretKey: 'sk_test_fake_key', webhookSecret: WEBHOOK_SECRET });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Intercepts the PaymentIntent cancel and counts how often it is hit.
function mockCancelCounted(piId: string, status: string) {
  const calls = { n: 0 };
  fetchMock.get('https://api.stripe.com')
    .intercept({ path: `/v1/payment_intents/${piId}/cancel`, method: 'POST' })
    .reply(200, () => { calls.n += 1; return { id: piId, status }; });
  return calls;
}

describe('event cancel closes sponsorship payment links', () => {
  it('requires_payment: PaymentIntent cancelled once, row cancelled/unpaid', async () => {
    const f = await fixture('rp', 'accepted');
    const calls = mockCancelCounted(f.piId, 'canceled');
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(calls.n).toBe(1);
    expect(await eventStatus(f.eventId)).toBe('cancelled');
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('in-flight PaymentIntent: row untouched, event still cancelled, webhook + sweep refund it', async () => {
    const f = await fixture('fl', 'accepted');
    const calls = mockCancelCounted(f.piId, 'succeeded');
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(calls.n).toBe(1);
    expect(await eventStatus(f.eventId)).toBe('cancelled');
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });

    // The payment lands: the webhook records it, the sweep refunds it (event cancelled).
    const wh = await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: f.piId, metadata: { sponsorshipId: f.bidId } } } });
    expect(wh.status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
    const refunds = mockRefund('re_evc_fl');
    const run = await SELF.fetch(`${PAYMENTS}/run-sweeps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-secret' },
      body: JSON.stringify({ sponsorshipIds: [f.bidId] }),
    });
    expect(run.status).toBe(200);
    expect(refunds.n).toBe(1);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'refunded' });
  });

  it('Stripe error: event still cancelled, row left recoverable (active/requires_payment)', async () => {
    const f = await fixture('er', 'accepted');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.get('https://api.stripe.com')
      .intercept({ path: `/v1/payment_intents/${f.piId}/cancel`, method: 'POST' })
      .reply(500, { error: { message: 'boom' } });
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await eventStatus(f.eventId)).toBe('cancelled');
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'requires_payment' });
    expect(errSpy.mock.calls.some((a) => a.map(String).join(' ').includes(f.bidId))).toBe(true);
  });

  it('pending bids become cancelled', async () => {
    const f = await fixture('pe', 'pending');
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
  });

  it('paid rows are untouched (the sweep refunds them)', async () => {
    const f = await fixture('pd', 'paid');
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await rowOf(f.bidId)).toEqual({ status: 'active', paymentStatus: 'paid' });
  });
});

// Owner request 2026-10-18: sponsors are told when the host's cancel closes their
// sponsorship. Reuses the generic event_cancelled type (notifications.type is plain
// text; no schema change). Test-domain recipients are never emailed (email guard).
describe('event cancel notifies the sponsor', () => {
  type N = { type: string; title: string; body: string; eventId: string | null };
  async function sponsorNotes(f: Fixture): Promise<N[]> {
    const res = await SELF.fetch('https://example.com/api/notifications', { headers: { Cookie: f.sponsor.cookie } });
    const { notifications } = await res.json() as { notifications: N[] };
    return notifications.filter((n) => n.type === 'event_cancelled' && n.eventId === f.eventId);
  }
  const BODY = "The host cancelled this party, so your sponsorship was cancelled. You weren't charged.";

  it('pending bid: exactly one notification with the right text; repeat PATCH adds none', async () => {
    const f = await fixture('npe', 'pending');
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    const notes = await sponsorNotes(f);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('"Sponsorship States Event" was cancelled');
    expect(notes[0].body).toBe(BODY);
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    expect(await sponsorNotes(f)).toHaveLength(1);
  });

  it('requires_payment: one notification; repeat PATCH adds none', async () => {
    const f = await fixture('nrp', 'accepted');
    mockCancelPi(f.piId);
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    const notes = await sponsorNotes(f);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe(BODY);
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    expect(await sponsorNotes(f)).toHaveLength(1);
  });

  it('in-flight PaymentIntent: no notification', async () => {
    const f = await fixture('nfl', 'accepted');
    mockCancelPi(f.piId, 'succeeded');
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    expect(await sponsorNotes(f)).toHaveLength(0);
  });

  it('Stripe error: no notification', async () => {
    const f = await fixture('ner', 'accepted');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.get('https://api.stripe.com')
      .intercept({ path: `/v1/payment_intents/${f.piId}/cancel`, method: 'POST' })
      .reply(500, { error: { message: 'boom' } });
    expect((await cancelEvent(f.host.cookie, f.eventId)).status).toBe(200);
    expect(await sponsorNotes(f)).toHaveLength(0);
  });

  it('notify failure does not fail the cancel', async () => {
    const f = await fixture('nfa', 'pending');
    vi.spyOn(notifications, 'notify').mockRejectedValue(new Error('notify down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await cancelEvent(f.host.cookie, f.eventId);
    expect(res.status).toBe(200);
    expect(await eventStatus(f.eventId)).toBe('cancelled');
    expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
    expect(await sponsorNotes(f)).toHaveLength(0); // proves the stub was hit
  });
});
