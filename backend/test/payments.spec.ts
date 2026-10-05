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

// v2 account retrieval (GET /v2/core/accounts/:id?include[0]=...). `transfers`
// is the recipient stripe_transfers capability status.
function mockV2Account(id: string, transfers: 'active' | 'pending' | 'restricted', extra: Record<string, unknown> = {}) {
  fetchMock
    .get('https://api.stripe.com')
    .intercept({ path: (p: string) => p.startsWith(`/v2/core/accounts/${id}`), method: 'GET' })
    .reply(200, {
      id,
      object: 'v2.core.account',
      applied_configurations: ['recipient'],
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: transfers, status_details: [] } } } },
      },
      ...extra,
    });
}

// Runs the payment sweeps scoped to the given sponsorships only. The sweep
// otherwise processes EVERY paid row in the shared dev DB, and the one-shot
// Stripe interceptors/counts would be consumed by other tests' leftover rows.
const runSweepsFor = (cookie: string, ...sponsorshipIds: string[]) =>
  SELF.fetch(`${PAYMENTS}/run-sweeps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ sponsorshipIds }),
  });

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

  it('POST /connect/onboard sends the Accounts v2 request shape (JSON, version header, recipient config)', async () => {
    const host = await signIn('conf-onboard-shape');
    let createReq: { headers: Record<string, string>; body: Record<string, any> } | null = null;
    let linkReq: { headers: Record<string, string>; body: Record<string, any> } | null = null;
    const capture = (sink: 'create' | 'link') => (opts: { headers?: unknown; body?: unknown }) => {
      const h = Object.fromEntries(
        Object.entries((opts.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]),
      );
      const rec = { headers: h, body: JSON.parse(String(opts.body)) };
      if (sink === 'create') createReq = rec; else linkReq = rec;
      return sink === 'create'
        ? { id: 'acct_shape_1' }
        : { url: 'https://connect.stripe.com/setup/shape', object: 'v2.core.account_link' };
    };
    fetchMock.get('https://api.stripe.com').intercept({ path: '/v2/core/accounts', method: 'POST' }).reply(200, capture('create'));
    fetchMock.get('https://api.stripe.com').intercept({ path: '/v2/core/account_links', method: 'POST' }).reply(200, capture('link'));

    const res = await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://connect.stripe.com/setup/shape' });

    expect(createReq!.headers['content-type']).toBe('application/json');
    expect(createReq!.headers['stripe-version']).toBe('2026-09-30.endive');
    expect(createReq!.body.dashboard).toBe('express');
    expect(createReq!.body.defaults.responsibilities).toEqual({ fees_collector: 'application', losses_collector: 'application' });
    expect(createReq!.body.configuration.recipient.capabilities.stripe_balance.stripe_transfers).toEqual({ requested: true });
    expect(createReq!.body.configuration.merchant).toBeUndefined();
    expect(linkReq!.headers['stripe-version']).toBe('2026-09-30.endive');
    expect(linkReq!.body.account).toBe('acct_shape_1');
    expect(linkReq!.body.use_case.type).toBe('account_onboarding');
    // `configurations` is response-only on v2 account links; sending it is a 400.
    expect(linkReq!.body.use_case.account_onboarding.configurations).toBeUndefined();
    expect(linkReq!.body.use_case.account_onboarding.refresh_url).toMatch(/\/payments\/onboard\/refresh\?account=acct_shape_1$/);
    expect(linkReq!.body.use_case.account_onboarding.return_url).toMatch(/\/payments\/onboard\/return$/);
  });

  it('POST /connect/onboard creates an account once and returns a link', async () => {
    const host = await signIn('conf-onboard');
    mockStripe('/v2/core/accounts', { id: 'acct_onboard_1' });
    mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/onboard1' });

    const res = await SELF.fetch(`${PAYMENTS}/connect/onboard`, {
      method: 'POST', headers: { Cookie: host.cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://connect.stripe.com/setup/onboard1' });

    // Second call reuses the stored account — only account_links is called again.
    mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/onboard2' });
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

    it('is idempotent: reuses a payable PaymentIntent, replaces a canceled one, 409s once paid', async () => {
      const host = await signIn('conf-pay-idem-host');
      const sponsor = await signIn('conf-pay-idem-sponsor');
      await registerSponsor(sponsor.cookie, 'Idem Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 5000);
      const pay = () => SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, { method: 'POST', headers: { Cookie: sponsor.cookie } });
      const headersOf = (opts: { headers?: unknown }) =>
        Object.fromEntries(Object.entries((opts.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));

      let key1 = '';
      fetchMock.get('https://api.stripe.com').intercept({ path: '/v1/payment_intents', method: 'POST' }).reply(200, (opts) => {
        key1 = headersOf(opts)['idempotency-key'];
        return { id: 'pi_idem_1', client_secret: 'pi_idem_1_secret' };
      });
      expect(await (await pay()).json()).toEqual({ clientSecret: 'pi_idem_1_secret' });
      expect(key1).toBe(`pay-${accepted.id}-first`);

      // Second tap: PI still payable -> retrieved, no create call.
      mockStripe('/v1/payment_intents/pi_idem_1', { id: 'pi_idem_1', client_secret: 'pi_idem_1_secret', status: 'requires_payment_method' }, 'GET');
      expect(await (await pay()).json()).toEqual({ clientSecret: 'pi_idem_1_secret' });

      // Canceled -> a new PI is created with a key derived from the old PI id.
      mockStripe('/v1/payment_intents/pi_idem_1', { id: 'pi_idem_1', client_secret: 'pi_idem_1_secret', status: 'canceled' }, 'GET');
      let key2 = '';
      fetchMock.get('https://api.stripe.com').intercept({ path: '/v1/payment_intents', method: 'POST' }).reply(200, (opts) => {
        key2 = headersOf(opts)['idempotency-key'];
        return { id: 'pi_idem_2', client_secret: 'pi_idem_2_secret' };
      });
      expect(await (await pay()).json()).toEqual({ clientSecret: 'pi_idem_2_secret' });
      expect(key2).toBe(`pay-${accepted.id}-pi_idem_1`);

      // Paid -> 409.
      await fireWebhook({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_idem_2', metadata: { sponsorshipId: accepted.id } } } });
      expect((await pay()).status).toBe(409);
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

    it('accepts a signature matching any secret in a comma-separated list', async () => {
      const prev = STRIPE_WEBHOOK_SECRET;
      __setTestStripeConfig({ secretKey: STRIPE_SECRET_KEY, webhookSecret: `${prev},whsec_second_destination` });
      try {
        const ok1 = await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_multi' } } }, prev);
        expect(ok1.status).toBe(200);
        const ok2 = await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_multi' } } }, 'whsec_second_destination');
        expect(ok2.status).toBe(200);
        const bad = await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_multi' } } }, 'whsec_unlisted');
        expect(bad.status).toBe(400);
      } finally {
        __setTestStripeConfig({ secretKey: STRIPE_SECRET_KEY, webhookSecret: prev });
      }
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

  describe('webhook event sources', () => {
    it('ignores payment_intent.succeeded carrying a connected `account`, accepts it from the platform', async () => {
      const host = await signIn('conf-src-host');
      const sponsor = await signIn('conf-src-sponsor');
      await registerSponsor(sponsor.cookie, 'Source Co');
      const event = await createEvent(host.cookie);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 4000);
      const pi = { id: 'pi_src_1', metadata: { sponsorshipId: accepted.id } };
      await fireWebhook({ type: 'payment_intent.succeeded', account: 'acct_other', data: { object: pi } });
      expect((await notificationsFor(sponsor.cookie)).some((n) => n.type === 'payment_received')).toBe(false);
      await fireWebhook({ type: 'payment_intent.succeeded', data: { object: pi } });
      expect((await notificationsFor(sponsor.cookie)).some((n) => n.type === 'payment_received')).toBe(true);
    });

    it('account.updated uses event.account to find the host', async () => {
      const host = await signIn('conf-src-acct-host');
      mockStripe('/v2/core/accounts', { id: 'acct_src_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/src' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      mockV2Account('acct_src_1', 'active');
      await fireWebhook({ type: 'account.updated', account: 'acct_src_1', data: { object: { id: 'acct_src_1', payouts_enabled: true } } });
      mockV2Account('acct_src_1', 'active'); // /connect/status re-checks the live v2 account
      const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: host.cookie } });
      expect(await res.json()).toMatchObject({ accountId: 'acct_src_1', payoutsEnabled: true });
    });

    it('v2 thin event re-fetches the account and sets payouts from the recipient capability', async () => {
      const host = await signIn('conf-thin-host');
      mockStripe('/v2/core/accounts', { id: 'acct_thin_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/thin' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });

      const thin = (type: string) => ({
        id: 'evt_test_thin', object: 'v2.core.event', type, livemode: false, context: null,
        related_object: { id: 'acct_thin_1', type: 'v2.core.account', url: '/v2/core/accounts/acct_thin_1' },
      });
      const status = async () => {
        mockV2Account('acct_thin_1', 'pending'); // status endpoint's own live check
        const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: host.cookie } });
        return (await res.json() as { payoutsEnabled: boolean }).payoutsEnabled;
      };

      mockV2Account('acct_thin_1', 'active');
      const ok = await fireWebhook(thin('v2.core.account[configuration.recipient].capability_status_updated'));
      expect(ok.status).toBe(200);
      // Stored flag is now true; confirm via DB-backed status with a matching live answer.
      mockV2Account('acct_thin_1', 'active');
      let res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: host.cookie } });
      expect(await res.json()).toMatchObject({ payoutsEnabled: true });

      // Capability regresses -> requirements.updated thin event flips it off.
      mockV2Account('acct_thin_1', 'restricted');
      await fireWebhook(thin('v2.core.account[requirements].updated'));
      expect(await status()).toBe(false);

      // Unrelated v2 event types are ignored (no account fetch -> no mock needed).
      await fireWebhook(thin('v2.core.account[identity].updated'));
    });

    it('a pending transfers capability is not payout-ready', async () => {
      const host = await signIn('conf-pending-host');
      mockStripe('/v2/core/accounts', { id: 'acct_pend_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/pend' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      mockV2Account('acct_pend_1', 'pending');
      const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: host.cookie } });
      expect(await res.json()).toMatchObject({ accountId: 'acct_pend_1', payoutsEnabled: false });
    });

    it('/connect/status serves the stored flag when the live check fails', async () => {
      const host = await signIn('conf-livefail-host');
      mockStripe('/v2/core/accounts', { id: 'acct_lf_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/lf' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      fetchMock.get('https://api.stripe.com')
        .intercept({ path: (p: string) => p.startsWith('/v2/core/accounts/acct_lf_1'), method: 'GET' })
        .reply(500, { error: { message: 'boom' } });
      const res = await SELF.fetch(`${PAYMENTS}/connect/status`, { headers: { Cookie: host.cookie } });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ accountId: 'acct_lf_1', payoutsEnabled: false });
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
      mockStripe('/v2/core/accounts', { id: 'acct_rel_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/rel' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      mockV2Account('acct_rel_1', 'active');
      await fireWebhook({ type: 'account.updated', data: { object: { id: 'acct_rel_1', payouts_enabled: true } } });

      let transferBody: Record<string, unknown> | null = null;
      fetchMock.get('https://api.stripe.com').intercept({ path: '/v1/transfers', method: 'POST' }).reply(200, (opts) => {
        transferBody = Object.fromEntries(new URLSearchParams(opts.body as string));
        return { id: 'tr_rel_1' };
      });

      const run1 = await runSweepsFor(host.cookie, accepted.id);
      expect(run1.status).toBe(200);
      expect(await run1.json()).toEqual({ released: 1, refunded: 0 });
      expect(transferBody).not.toBeNull();
      expect(Number((transferBody as unknown as Record<string, string>).amount)).toBe(17000); // 20000 - 3000 fee
      expect((transferBody as unknown as Record<string, string>).destination).toBe('acct_rel_1');

      const hostNotifs = await notificationsFor(host.cookie);
      expect(hostNotifs.some((n) => n.type === 'payout_sent' && n.eventId === event.id)).toBe(true);

      // Rerun: sponsorship is no longer 'paid', so no second transfer call is made.
      const run2 = await runSweepsFor(host.cookie, accepted.id);
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
      const run = await runSweepsFor(host.cookie, accepted.id);
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
      const run1 = await runSweepsFor(host.cookie, accepted.id);
      expect(run1.status).toBe(200);
      expect(await run1.json()).toEqual({ released: 0, refunded: 1 });

      const sponsorNotifs = await notificationsFor(sponsor.cookie);
      expect(sponsorNotifs.some((n) => n.type === 'payment_refunded' && n.eventId === event.id)).toBe(true);

      // Rerun: sponsorship is now 'refunded', not 'paid' — no second refund call.
      const run2 = await runSweepsFor(host.cookie, accepted.id);
      expect(run2.status).toBe(200);
      expect(await run2.json()).toEqual({ released: 0, refunded: 0 });
    });
  });
  // ─── Refund policy (PAYMENTS.md) ───────────────────────────────────────────
  describe('sponsor withdrawal refund policy', () => {
    const futureIso = (msAhead: number) => new Date(Date.now() + msAhead).toISOString();

    // Event + accepted bid + PaymentIntent + webhook -> a 'paid' sponsorship.
    async function paidSponsorship(tag: string, eventOverrides: Record<string, unknown>) {
      const host = await signIn(`refpol-${tag}-host`);
      const sponsor = await signIn(`refpol-${tag}-sponsor`);
      await registerSponsor(sponsor.cookie, `Refpol ${tag} Co`);
      const event = await createEvent(host.cookie, eventOverrides);
      const accepted = await bidAndAccept(host.cookie, sponsor.cookie, event.id, 9000);
      const piId = `pi_refpol_${tag}_${TS}`;
      mockStripe('/v1/payment_intents', { id: piId, client_secret: `${piId}_secret` });
      await SELF.fetch(`${PAYMENTS}/sponsorships/${accepted.id}/pay`, {
        method: 'POST', headers: { Cookie: sponsor.cookie },
      });
      await fireWebhook({
        type: 'payment_intent.succeeded',
        data: { object: { id: piId, metadata: { sponsorshipId: accepted.id } } },
      });
      return { host, sponsor, event, bidId: accepted.id };
    }

    const patchBid = (cookie: string, bidId: string, status: string) =>
      SELF.fetch(`${SPONSORS}/bids/${bidId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ status }),
      });

    async function paymentStatusOf(host: { cookie: string }, eventId: string, bidId: string) {
      const res = await SELF.fetch(`${SPONSORS}/events/${eventId}/bids`, { headers: { Cookie: host.cookie } });
      const { bids } = await res.json() as { bids: { id: string; paymentStatus: string }[] };
      return bids.find((b) => b.id === bidId)?.paymentStatus;
    }

    it('sponsor withdraws before start: refunded', async () => {
      const { host, sponsor, event, bidId } = await paidSponsorship('before', { startsAt: futureIso(48 * HOUR) });
      mockStripe('/v1/refunds', { id: 're_refpol_before' });
      const res = await patchBid(sponsor.cookie, bidId, 'cancelled');
      expect(res.status).toBe(200);
      const { bid } = await res.json() as { bid: { status: string; paymentStatus: string } };
      expect(bid.status).toBe('cancelled');
      expect(bid.paymentStatus).toBe('refunded');
      expect(await paymentStatusOf(host, event.id, bidId)).toBe('refunded');
      const notifs = await notificationsFor(sponsor.cookie);
      expect(notifs.some((n) => n.type === 'payment_refunded' && n.eventId === event.id)).toBe(true);
    });

    it('sponsor withdraws after start: rejected with refund_window_closed, no refund', async () => {
      const { host, sponsor, event, bidId } = await paidSponsorship('after', {
        startsAt: pastIso(HOUR), endsAt: futureIso(2 * HOUR),
      });
      // No /v1/refunds interceptor: any outbound refund call would fail.
      const res = await patchBid(sponsor.cookie, bidId, 'cancelled');
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'refund_window_closed' });
      expect(await paymentStatusOf(host, event.id, bidId)).toBe('paid');
    });

    it('host cancels the event after start: refunded by the sweep', async () => {
      const { host, sponsor, event, bidId } = await paidSponsorship('hostcancel', {
        startsAt: pastIso(HOUR), endsAt: futureIso(2 * HOUR),
      });
      const cancelRes = await SELF.fetch(`${EVENTS}/${event.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      expect(cancelRes.status).toBe(200);
      mockStripe('/v1/refunds', { id: 're_refpol_hostcancel' });
      const run = await runSweepsFor(host.cookie, bidId);
      expect(run.status).toBe(200);
      expect((await run.json() as { refunded: number }).refunded).toBe(1);
      expect(await paymentStatusOf(host, event.id, bidId)).toBe('refunded');
      const notifs = await notificationsFor(sponsor.cookie);
      expect(notifs.some((n) => n.type === 'payment_refunded' && n.eventId === event.id)).toBe(true);
    });

    it('already released: no withdrawal and no refund', async () => {
      const { host, sponsor, event, bidId } = await paidSponsorship('released', {
        startsAt: pastIso(26 * HOUR), endsAt: pastIso(25 * HOUR),
      });
      mockStripe('/v2/core/accounts', { id: `acct_refpol_${TS}` });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/refpol' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });
      mockV2Account(`acct_refpol_${TS}`, 'active');
      await fireWebhook({ type: 'account.updated', data: { object: { id: `acct_refpol_${TS}`, payouts_enabled: true } } });
      mockStripe('/v1/transfers', { id: `tr_refpol_${TS}` });
      await runSweepsFor(host.cookie, bidId);
      expect(await paymentStatusOf(host, event.id, bidId)).toBe('released');

      // No /v1/refunds interceptor: a refund attempt would fail the call.
      const res = await patchBid(sponsor.cookie, bidId, 'cancelled');
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'already_released' });
      const run = await runSweepsFor(host.cookie, bidId);
      expect((await run.json() as { refunded: number }).refunded).toBe(0);
      expect(await paymentStatusOf(host, event.id, bidId)).toBe('released');
    });
  });
});

// ─── Public onboarding landing pages ──────────────────────────────────────────

describe('onboarding return/refresh pages', () => {
  const PAGES = 'https://example.com/payments/onboard';

  it('GET /return renders the branded page with the settings deep link', async () => {
    const res = await SELF.fetch(`${PAGES}/return`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Payouts connected');
    expect(html).toContain('href="spotseek://settings"');
    expect(html).toContain('#0F0F12');
    expect(html).toContain('#00e5ff');
  });

  describe('refresh', () => {
    beforeAll(() => {
      __setTestStripeConfig({ secretKey: STRIPE_SECRET_KEY, webhookSecret: STRIPE_WEBHOOK_SECRET });
    });

    it('302s to a fresh account link for a known account', async () => {
      const host = await signIn('onboard-refresh');
      mockStripe('/v2/core/accounts', { id: 'acct_refresh_1' });
      mockStripe('/v2/core/account_links', { url: 'https://connect.stripe.com/setup/first' });
      await SELF.fetch(`${PAYMENTS}/connect/onboard`, { method: 'POST', headers: { Cookie: host.cookie } });

      let linkBody: Record<string, any> | null = null;
      fetchMock.get('https://api.stripe.com').intercept({ path: '/v2/core/account_links', method: 'POST' }).reply(200, (opts) => {
        linkBody = JSON.parse(String(opts.body));
        return { url: 'https://connect.stripe.com/setup/fresh' };
      });
      const res = await SELF.fetch(`${PAGES}/refresh?account=acct_refresh_1`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://connect.stripe.com/setup/fresh');
      expect(linkBody!.account).toBe('acct_refresh_1');
      expect(linkBody!.use_case.account_onboarding.refresh_url).toMatch(/\/payments\/onboard\/refresh\?account=acct_refresh_1$/);
    });

    it('shows the fallback page for an unknown account (and does not call Stripe)', async () => {
      const res = await SELF.fetch(`${PAGES}/refresh?account=acct_nobody_${TS}`, { redirect: 'manual' });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Set up payouts');
    });

    it('shows the fallback page when the account param is missing', async () => {
      const res = await SELF.fetch(`${PAGES}/refresh`, { redirect: 'manual' });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Set up payouts');
    });
  });
});
