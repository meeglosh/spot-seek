/**
 * sponsorship_cancelled notices (PATCH /api/sponsors/bids/:id), owner request
 * 2026-10-18. Test mode only: Stripe is mocked via fetchMock, recipients are
 * @spotseek.test so the email guard suppresses real sends.
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

type N = { type: string; title: string; body: string; eventId: string | null };
async function notesOf(cookie: string, eventId: string, type = 'sponsorship_cancelled'): Promise<N[]> {
  const res = await SELF.fetch('https://example.com/api/notifications', { headers: { Cookie: cookie } });
  const { notifications } = await res.json() as { notifications: N[] };
  return notifications.filter((n) => n.type === type && n.eventId === eventId);
}
const TITLE = 'Sponsorship States Event';

describe('sponsor withdraws -> host notified once', () => {
  it('active requires_payment: PI cancelled, host gets the notice, sponsor gets none; repeat adds none', async () => {
    const f = await fixture('sw-rp', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);
    const notes = await notesOf(f.host.cookie, f.eventId);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe(`"Sst sw-rp Co" withdrew from "${TITLE}"`);
    expect(notes[0].body).toBe('Their sponsorship was cancelled before any payment.');
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(409);
    expect(await notesOf(f.host.cookie, f.eventId)).toHaveLength(1);
  });

  it('active unpaid (legacy row)', async () => {
    const f = await fixture('sw-up', 'accepted');
    await sql()`UPDATE sponsorships SET payment_status = 'unpaid', payment_intent_id = NULL WHERE id = ${f.bidId}`;
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);
    const notes = await notesOf(f.host.cookie, f.eventId);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe(`"Sst sw-up Co" withdrew from "${TITLE}"`);
  });

  it('pending bid: "withdrew their offer"', async () => {
    const f = await fixture('sw-pb', 'pending');
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);
    const notes = await notesOf(f.host.cookie, f.eventId);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe(`"Sst sw-pb Co" withdrew their offer on "${TITLE}"`);
    expect(notes[0].body).toBe('Their offer was cancelled before it was accepted.');
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
  });

  it('paid, before start: sponsor gets only payment_refunded, host gets the refunded variant', async () => {
    const f = await fixture('sw-pd', 'paid', { startsAt: futureIso(48 * HOUR) });
    mockRefund('re_scn_sw');
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(200);
    const notes = await notesOf(f.host.cookie, f.eventId);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('Their sponsorship was cancelled and refunded in full.');
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
    expect(await notesOf(f.sponsor.cookie, f.eventId, 'payment_refunded')).toHaveLength(1);
  });
});

describe('host ends it -> sponsor notified once', () => {
  it('active requires_payment: PI cancelled, sponsor gets the notice, host gets none; repeat adds none', async () => {
    const f = await fixture('hc-rp', 'accepted');
    mockCancelPi(f.piId);
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(200);
    const notes = await notesOf(f.sponsor.cookie, f.eventId);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe(`Your sponsorship of "${TITLE}" was cancelled`);
    expect(notes[0].body).toBe("The host ended this sponsorship before any payment. You weren't charged.");
    expect(await notesOf(f.host.cookie, f.eventId)).toHaveLength(0);
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(409);
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(1);
  });

  it('active unpaid (legacy row)', async () => {
    const f = await fixture('hc-up', 'accepted');
    await sql()`UPDATE sponsorships SET payment_status = 'unpaid', payment_intent_id = NULL WHERE id = ${f.bidId}`;
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(200);
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(1);
  });

  it('host withdraws a pending request they initiated', async () => {
    const host = await signIn('hw-host');
    const sponsor = await signIn('hw-sponsor');
    await SELF.fetch(`${SPONSORS}/register`, { method: 'POST', headers: json(sponsor.cookie), body: JSON.stringify({ companyName: 'Sst hw Co' }) });
    const event = await createEvent(host.cookie);
    const reqRes = await whileOpen(event.id, () => SELF.fetch(`${SPONSORS}/requests`, {
      method: 'POST', headers: json(host.cookie), body: JSON.stringify({ eventId: event.id, sponsorId: sponsor.id, amountCents: 5000 }),
    }));
    const { request } = await reqRes.json() as { request: { id: string } };
    expect((await patchBid(host.cookie, request.id, 'cancelled')).status).toBe(200);
    const notes = await notesOf(sponsor.cookie, event.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe(`The host withdrew their request for "${TITLE}"`);
    expect(notes[0].body).toBe("You weren't charged.");
    expect(await notesOf(host.cookie, event.id)).toHaveLength(0);
  });

  it('paid, before start: sponsor gets only payment_refunded (no cancel notice); host gets none', async () => {
    const f = await fixture('hc-pd', 'paid', { startsAt: futureIso(48 * HOUR) });
    mockRefund('re_scn_hc');
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(200);
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
    expect(await notesOf(f.sponsor.cookie, f.eventId, 'payment_refunded')).toHaveLength(1);
    expect(await notesOf(f.host.cookie, f.eventId)).toHaveLength(0);
  });
});

describe('no notice when the transition is refused', () => {
  it('403 refund_window_closed / cancel_event_instead on a paid row after start', async () => {
    const f = await fixture('rf-403', 'paid', { startsAt: pastIso(HOUR), endsAt: futureIso(2 * HOUR) });
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(403);
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(403);
    expect(await notesOf(f.host.cookie, f.eventId)).toHaveLength(0);
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
  });

  it('409 on a terminal row and 400 for the wrong party on a pending one', async () => {
    const f = await fixture('rf-409', 'pending');
    expect((await patchBid(f.host.cookie, f.bidId, 'cancelled')).status).toBe(400);
    expect((await patchBid(f.host.cookie, f.bidId, 'rejected')).status).toBe(200);
    expect((await patchBid(f.sponsor.cookie, f.bidId, 'cancelled')).status).toBe(409);
    expect(await notesOf(f.host.cookie, f.eventId)).toHaveLength(0);
    expect(await notesOf(f.sponsor.cookie, f.eventId)).toHaveLength(0);
  });
});

describe('notify failure never fails the PATCH', () => {
  it('returns 200 and the row is cancelled even when the notice insert throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = await fixture('nf', 'pending');
    const db = sql();
    // Per-event trigger so parallel specs sharing the DB are unaffected.
    await db.query(`CREATE OR REPLACE FUNCTION scn_fail_${f.eventId.replace(/-/g, '')}() RETURNS trigger AS $$ BEGIN IF NEW.type = 'sponsorship_cancelled' THEN RAISE EXCEPTION 'scn boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    const fn = `scn_fail_${f.eventId.replace(/-/g, '')}`;
    await db.query(`CREATE TRIGGER ${fn} BEFORE INSERT ON notifications FOR EACH ROW WHEN (NEW.event_id = '${f.eventId}') EXECUTE FUNCTION ${fn}()`);
    try {
      const res = await patchBid(f.sponsor.cookie, f.bidId, 'cancelled');
      expect(res.status).toBe(200);
      expect(await rowOf(f.bidId)).toEqual({ status: 'cancelled', paymentStatus: 'unpaid' });
      expect(errSpy.mock.calls.some((a) => a.map(String).join(' ').includes('sponsorship_cancelled notify failed'))).toBe(true);
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${fn} ON notifications`);
      await db.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
});
