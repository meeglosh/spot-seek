/**
 * Sponsorship payments (PAYMENTS.md): unconfigured-mode graceful fallback,
 * acceptance -> requires_payment, /pay, webhook signature verification +
 * payment_intent.succeeded, and the release/refund sweeps.
 *
 * No real Stripe key exists anywhere (CLAUDE.md hard stop). "Configured mode"
 * is exercised via `__setTestStripeConfig()`, a module-level injection point
 * exported by src/payments.ts for tests only (env.STRIPE_* stays undefined
 * throughout — see admin.spec.ts for the same "absent in test env => graceful
 * fallback" idea with ADMIN_SECRET), combined with intercepting outbound
 * calls to api.stripe.com via `fetchMock`, exactly like test/geocode.spec.ts
 * does for Photon. Webhook signatures are computed for real with Node's
 * crypto against the same fake webhook secret, so signature verification
 * itself is genuinely exercised, not mocked.
 */
import { SELF, fetchMock } from 'cloudflare:test';
import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { __setTestStripeConfig } from '../src/payments';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const SPONSORS = 'https://example.com/api/sponsors';
const PAYMENTS = 'https://example.com/api/payments';
const NOTIFICATIONS = 'https://example.com/api/notifications';

const TS = Date.now();
const HOUR = 60 * 60 * 1000;
const pastIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

const STRIPE_SECRET_KEY = 'sk_test_fake_key';
const STRIPE_WEBHOOK_SECRET = 'whsec_fake_secret';

async function signIn(suffix: string) {
  const email = `pay-${suffix}-${TS}@spotseek.test`;
  const pw = 'Pay_Pwd_1!';
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

async function registerSponsor(cookie: string, company: string) {
  await SELF.fetch(`${SPONSORS}/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ companyName: company }),
  });
}

async function createEvent(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: 'Payments Test Event', broadcastSubject: 'Hockey', status: 'published', ...overrides }),
  });
  const { event } = await res.json() as { event: { id: string } };
  return event;
}

// Bids amountCents on eventId, host accepts it -> paymentStatus requires_payment.
async function bidAndAccept(hostCookie: string, sponsorCookie: string, eventId: string, amountCents: number) {
  const bidRes = await SELF.fetch(`${SPONSORS}/bids`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsorCookie },
    body: JSON.stringify({ eventId, amountCents }),
  });
  const { bid } = await bidRes.json() as { bid: { id: string; platformFeeCents: number } };

  const acceptRes = await SELF.fetch(`${SPONSORS}/bids/${bid.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
    body: JSON.stringify({ status: 'active' }),
  });
  const { bid: accepted } = await acceptRes.json() as { bid: { id: string; paymentStatus: string; platformFeeCents: number } };
  expect(accepted.paymentStatus).toBe('requires_payment');
  return accepted;
}

function stripeSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function fireWebhook(payload: unknown, secret = STRIPE_WEBHOOK_SECRET, sigOverride?: string) {
  const body = JSON.stringify(payload);
  const sig = sigOverride ?? stripeSignatureHeader(body, secret);
  return SELF.fetch(`${PAYMENTS}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
    body,
  });
}

function mockStripe(path: string, response: Record<string, unknown>, method = 'POST') {
  fetchMock.get('https://api.stripe.com').intercept({ path, method }).reply(200, response);
}

async function notificationsFor(cookie: string) {
  const res = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: cookie } });
  const { notifications } = await res.json() as { notifications: { type: string; eventId: string | null }[] };
  return notifications;
}

// Note: unlike test/geocode.spec.ts, we do NOT call fetchMock.disableNetConnect()
// here — these tests sign in real users and hit the real dev DB (like every
// other spec file), so unmatched requests (Neon, Better Auth) must fall
// through to the real network. Only calls to api.stripe.com are intercepted.
beforeAll(() => {
  fetchMock.activate();
});

// ─── Unconfigured mode (no fake keys installed yet) ───────────────────────────

describe('unconfigured mode', () => {
  it('GET /connect/status renders gracefully instead of erroring', async () => {
    const user = await signIn('unconf-status');
    const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: user.cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accountId: null, payoutsEnabled: false, configured: false });
  });

  it('POST /connect/onboard returns 503 payments_not_configured', async () => {
    const user = await signIn('unconf-onboard');
    const res = await SELF.fetch(`${PAYMENTS}/connect/onboard`, {
      method: 'POST', headers: { Cookie: user.cookie },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'payments_not_configured' });
  });

  it('POST /sponsorships/:id/pay returns 503 payments_not_configured', async () => {
    const user = await signIn('unconf-pay');
    const res = await SELF.fetch(`${PAYMENTS}/sponsorships/00000000-0000-0000-0000-000000000000/pay`, {
      method: 'POST', headers: { Cookie: user.cookie },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'payments_not_configured' });
  });

  it('POST /webhook returns 503 payments_not_configured', async () => {
    const res = await SELF.fetch(`${PAYMENTS}/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=x' },
      body: '{}',
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'payments_not_configured' });
  });

  it('acceptance still sets requires_payment and notifies the sponsor even unconfigured', async () => {
    const host = await signIn('unconf-acc-host');
    const sponsor = await signIn('unconf-acc-sponsor');
    await registerSponsor(sponsor.cookie, 'Unconf Co');
    const event = await createEvent(host.cookie);
    const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 5000);
    expect(accepted.paymentStatus).toBe('requires_payment');

    const notifs = await notificationsFor(sponsor.cookie);
    expect(notifs.some((n) => n.type === 'payment_due' && n.eventId === event.id)).toBe(true);
  });
});

// ─── Configured mode: fake keys installed, Stripe calls intercepted ──────────

describe('configured mode', () => {
  beforeAll(() => {
    __setTestStripeConfig({ secretKey: STRIPE_SECRET_KEY, webhookSecret: STRIPE_WEBHOOK_SECRET });
  });

  it('GET /connect/status reports configured:true', async () => {
    const user = await signIn('conf-status');
    const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: user.cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accountId: null, payoutsEnabled: false, configured: true });
  });

  it('POST /connect/onboard creates an account once and returns a link', async () => {
    const host = await signIn('conf-onboard');
    mockStripe('/v1/accounts', { id: 'acct_onboard_1' });
    mockStripe('/v1/account_links', { url: 'https://connect.stripe.com/setup/onboard1' });

    const res = await SELF.fetch(`${PAYMENTS}/connect/onboard`, {
      method: 'POST', headers: { Cookie: host.cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://connect.stripe.com/setup/onboard1' });

    // Second call reuses the stored account — only account_links is called again.
    mockStripe('/v1/account_links', { url: 'https://connect.stripe.com/setup/onboard2' });
    const res2 = await SELF.fetch(`${PAYMENTS}/connect/onboard`, {
      method: 'POST', headers: { Cookie: host.cookie },
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ url: 'https://connect.stripe.com/setup/onboard2' });
  });

  describe('/pay', () => {
    it('happy path returns a client secret and stores the payment intent id', async () => {
      const host = await signIn('conf-pay-host');
      const sponsor = await signIn('conf-pay-sponsor');
      await registerSponsor(sponsor.cookie, 'Pay Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 8000);

      mockStripe('/v1/payment_intents', { id: 'pi_pay_1', client_secret: 'pi_pay_1_secret' });
      const res = await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ clientSecret: 'pi_pay_1_secret' });
    });

    it('rejects the wrong caller', async () => {
      const host = await signIn('conf-pay-wrong-host');
      const sponsor = await signIn('conf-pay-wrong-sponsor');
      const stranger = await signIn('conf-pay-wrong-stranger');
      await registerSponsor(sponsor.cookie, 'Wrong Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 4000);

      const res = await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: stranger.cookie },
      });
      expect(res.status).toBe(403);
    });

    it('rejects a sponsorship not awaiting payment', async () => {
      const host = await signIn('conf-pay-status-host');
      const sponsor = await signIn('conf-pay-status-sponsor');
      await registerSponsor(sponsor.cookie, 'Status Co');
      const event = await createEvent(host.cookie);

      const bidRes = await SELF.fetch(`${SPONSORS}/bids`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
        body: JSON.stringify({ eventId: event.id, amountCents: 3000 }),
      });
      const { bid } = await bidRes.json() as { bid: { id: string } };
      // Still pending — never accepted, so paymentStatus is still 'unpaid'.

      const res = await SELF.fetch(`${PAYMENTS}/sponsorships/${bid.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('webhook signature verification', () => {
    it('rejects a tampered payload', async () => {
      const goodPayload = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { metadata: {} } } });
      const sig = stripeSignatureHeader(goodPayload, STRIPE_WEBHOOK_SECRET);
      // Signature was computed over goodPayload but we send a different body.
      const res = await SELF.fetch(`${PAYMENTS}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
        body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { metadata: { tampered: true } } } }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const res = await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_x' } } }, 'whsec_totally_wrong');
      expect(res.status).toBe(400);
    });

    it('accepts a validly signed payload', async () => {
      const res = await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_nonexistent' } } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  });

  describe('payment_intent.succeeded -> paid', () => {
    it('marks the sponsorship paid and notifies both parties', async () => {
      const host = await signIn('conf-webhook-host');
      const sponsor = await signIn('conf-webhook-sponsor');
      await registerSponsor(sponsor.cookie, 'Webhook Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 6000);

      mockStripe('/v1/payment_intents', { id: 'pi_wh_1', client_secret: 'pi_wh_1_secret' });
      await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });

      const res = await fireWebhook({
        id: 'evt_wh_1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_wh_1', metadata: { sponsorshipId: accepted.id } } },
      });
      expect(res.status).toBe(200);

      const sponsorNotifs = await notificationsFor(sponsor.cookie);
      expect(sponsorNotifs.some((n) => n.type === 'payment_received' && n.eventId === event.id)).toBe(true);
      const hostNotifs = await notificationsFor(host.cookie);
      expect(hostNotifs.some((n) => n.type === 'payment_received' && n.eventId === event.id)).toBe(true);
    });
  });

  describe('sweeps', () => {
    it('release sweep transfers amount-fee to the host once payouts are enabled, and is idempotent', async () => {
      const host = await signIn('conf-sweep-rel-host');
      const sponsor = await signIn('conf-sweep-rel-sponsor');
      await registerSponsor(sponsor.cookie, 'Release Co');
      const event = await createEvent(host.cookie, {
        startsAt: pastIso(26 * HOUR),
        endsAt: pastIso(25 * HOUR), // ended >=24h ago
      });
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 20000); // fee 3000

      mockStripe('/v1/payment_intents', { id: 'pi_rel_1', client_secret: 'pi_rel_1_secret' });
      await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      await fireWebhook({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_rel_1', metadata: { sponsorshipId: accepted.id } } },
      });

      // Host onboards, then Stripe confirms payouts are enabled.
      mockStripe('/v1/accounts', { id: 'acct_rel_1' });
      mockStripe('/v1/account_links', { url: 'https://connect.stripe.com/setup/rel' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_rel_1', payouts_enabled: true } } });

      let transferBody: Record<string, unknown> | null = null;
      fetchMock.get('https://api.stripe.com').intercept({ path: '/v1/transfers', method: 'POST' }).reply(200, (opts) => {
        transferBody = Object.fromEntries(new URLSearchParams(opts.body as string));
        return { id: 'tr_rel_1' };
      });

      const run1 = await SELF.fetch(`${PAYMENTS}/run-sweeps`, { method: 'POST', headers: { Cookie: host.cookie } });
      expect(run1.status).toBe(200);
      expect(await run1.json()).toEqual({ released: 1, refunded: 0 });
      expect(transferBody).not.toBeNull();
      expect(Number((transferBody as unknown as Record<string, string>).amount)).toBe(17000); // 20000 - 3000 fee
      expect((transferBody as unknown as Record<string, string>).destination).toBe('acct_rel_1');

      const hostNotifs = await notificationsFor(host.cookie);
      expect(hostNotifs.some((n) => n.type === 'payout_sent' && n.eventId === event.id)).toBe(true);

      // Rerun: sponsorship is no longer 'paid', so no second transfer call is made.
      const run2 = await SELF.fetch(`${PAYMENTS}/run-sweeps`, { method: 'POST', headers: { Cookie: host.cookie } });
      expect(run2.status).toBe(200);
      expect(await run2.json()).toEqual({ released: 0, refunded: 0 });
    });

    it('does not release a paid sponsorship whose event ended less than 24h ago', async () => {
      const host = await signIn('conf-sweep-early-host');
      const sponsor = await signIn('conf-sweep-early-sponsor');
      await registerSponsor(sponsor.cookie, 'Early Co');
      const event = await createEvent(host.cookie, {
        startsAt: pastIso(3 * HOUR),
        endsAt: pastIso(HOUR), // ended only 1h ago
      });
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 5000);

      mockStripe('/v1/payment_intents', { id: 'pi_early_1', client_secret: 'pi_early_1_secret' });
      await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      await fireWebhook({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_early_1', metadata: { sponsorshipId: accepted.id } } },
      });

      // No /v1/transfers interceptor registered — if the sweep tried to
      // transfer, fetchMock would reject the outbound call.
      const run = await SELF.fetch(`${PAYMENTS}/run-sweeps`, { method: 'POST', headers: { Cookie: host.cookie } });
      expect(run.status).toBe(200);
      const body = await run.json() as { released: number };
      expect(body.released).toBe(0);
    });

    it('refund sweep refunds a paid sponsorship once the event is cancelled, and is idempotent', async () => {
      const host = await signIn('conf-sweep-ref-host');
      const sponsor = await signIn('conf-sweep-ref-sponsor');
      await registerSponsor(sponsor.cookie, 'Refund Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 7000);

      mockStripe('/v1/payment_intents', { id: 'pi_ref_1', client_secret: 'pi_ref_1_secret' });
      await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      await fireWebhook({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_ref_1', metadata: { sponsorshipId: accepted.id } } },
      });

      const cancelRes = await SELF.fetch(`${EVENTS}/${event.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      expect(cancelRes.status).toBe(200);

      mockStripe('/v1/refunds', { id: 're_ref_1' });
      const run1 = await SELF.fetch(`${PAYMENTS}/run-sweeps`, { method: 'POST', headers: { Cookie: host.cookie } });
      expect(run1.status).toBe(200);
      expect(await run1.json()).toEqual({ released: 0, refunded: 1 });

      const sponsorNotifs = await notificationsFor(sponsor.cookie);
      expect(sponsorNotifs.some((n) => n.type === 'payment_refunded' && n.eventId === event.id)).toBe(true);

      // Rerun: sponsorship is now 'refunded', not 'paid' — no second refund call.
      const run2 = await SELF.fetch(`${PAYMENTS}/run-sweeps`, { method: 'POST', headers: { Cookie: host.cookie } });
      expect(run2.status).toBe(200);
      expect(await run2.json()).toEqual({ released: 0, refunded: 0 });
    });
  });
});
