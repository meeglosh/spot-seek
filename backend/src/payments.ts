/**
 * Sponsorship payments (PAYMENTS.md) — Stripe Connect marketplace, separate
 * charges & transfers. Graceful unconfigured mode mirrors the RESEND_API_KEY
 * fallback pattern in notifications.ts: when STRIPE_SECRET_KEY / _WEBHOOK_
 * SECRET are absent, routes return 503 { error: 'payments_not_configured' }
 * (except GET /connect/status, which must render state without erroring)
 * and the sweep no-ops.
 *
 * No live keys exist anywhere in this repo (CLAUDE.md hard stop), and
 * STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are not declared as bindings
 * anywhere, so `env.STRIPE_*` is always undefined outside tests. Tests
 * exercise "configured" behavior via `__setTestStripeConfig()` below (a
 * module-level injection point, imported directly by test/payments.spec.ts)
 * combined with `fetchMock` intercepting the resulting calls to
 * api.stripe.com — this works because vitest-pool-workers runs the module
 * under test and the SELF-routed worker in the same isolate, so the override
 * set from the test file is visible to the real route handlers.
 */
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { requireAdmin } from './admin';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
import { notify } from './notifications';
import { publicBaseUrl } from './email';
import { realStripe, verifyStripeSignature } from './stripe';
import type { StripeClient } from './stripe';

// The fee itself is computed once and stored on sponsorships.platformFeeCents
// at bid time (sponsors.ts PLATFORM_FEE_RATE) — payments only ever reads it
// back to size the transfer, so no rate constant is needed here.
const CURRENCY = 'usd';
const PAYABLE_INTENT_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);
const RELEASE_DELAY_MS = 24 * 60 * 60 * 1000; // 24h dispute window post-event

type Db = ReturnType<typeof drizzle<typeof schema>>;

// ─── Test-only config injection ───────────────────────────────────────────────
// See file header. Not reachable from any route input — only a test importing
// this module directly can set it. `null` (the default) always defers to env.
let testStripeConfig: { secretKey: string; webhookSecret: string } | null = null;
export function __setTestStripeConfig(config: { secretKey: string; webhookSecret: string } | null): void {
  testStripeConfig = config;
}

function stripeSecretKey(env: Env): string | undefined {
  return testStripeConfig?.secretKey ?? env.STRIPE_SECRET_KEY;
}

function stripeWebhookSecret(env: Env): string | undefined {
  return testStripeConfig?.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET;
}

export function getClient(env: Env): StripeClient | null {
  const key = stripeSecretKey(env);
  return key ? realStripe(key) : null;
}

// Refund policy (PAYMENTS.md): a paid sponsorship is refunded in full if it is
// withdrawn/cancelled before funds are released. Once the event's start time
// has passed, only a host cancelling the event triggers a refund — the sponsor
// can no longer withdraw.
export function sponsorRefundWindowClosed(event: { startsAt: Date | null }, now = Date.now()): boolean {
  return event.startsAt != null && event.startsAt.getTime() <= now;
}

function fmtUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ─── Router ────────────────────────────────────────────────────────────────────

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const paymentsRouter = new Hono<AppEnv>();

async function requireAuth(c: Context<AppEnv>, next: Next) {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
}

// POST /connect/onboard (host) — creates/reuses a Stripe Accounts v2 connected
// account (recipient configuration, Express dashboard) and returns a fresh v2
// account-link URL for Stripe-hosted onboarding.
paymentsRouter.post('/connect/onboard', requireAuth, async (c) => {
  const client = getClient(c.env);
  if (!client) return c.json({ error: 'payments_not_configured' }, 503);

  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ error: 'Not found' }, 404);

  let accountId = user.stripeAccountId;
  if (!accountId) {
    const account = await client.createAccount({ email: user.email, displayName: user.displayName });
    accountId = account.id;
    await db.update(schema.users).set({ stripeAccountId: accountId }).where(eq(schema.users.id, userId));
  }

  const base = publicBaseUrl(c.env);
  const link = await client.createAccountLink(
    accountId,
    `${base}/payments/onboard/refresh?account=${encodeURIComponent(accountId)}`,
    `${base}/payments/onboard/return`,
  );
  return c.json({ url: link.url });
});

// GET /connect/status (host) — always 200 so the app can render payout state
// without special-casing errors; `configured: false` when Stripe isn't set up.
paymentsRouter.get('/connect/status', requireAuth, async (c) => {
  const client = getClient(c.env);
  if (!client) return c.json({ accountId: null, payoutsEnabled: false, configured: false });

  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  let payoutsEnabled = user?.stripePayoutsEnabled ?? false;
  // The host just returned from hosted onboarding (or is polling): re-check the
  // v2 account directly rather than relying only on the webhook having landed.
  // Best-effort — on a Stripe error we serve the stored flag.
  if (user?.stripeAccountId) {
    try {
      const live = await client.getAccount(user.stripeAccountId);
      if (live.payoutsEnabled !== payoutsEnabled) {
        payoutsEnabled = live.payoutsEnabled;
        await db.update(schema.users).set({ stripePayoutsEnabled: payoutsEnabled }).where(eq(schema.users.id, userId));
      }
    } catch (err) {
      console.error('[payments] live account status check failed:', err);
    }
  }
  return c.json({
    accountId: user?.stripeAccountId ?? null,
    payoutsEnabled,
    configured: true,
  });
});

// POST /sponsorships/:id/pay (sponsor) — creates the PaymentIntent for an
// accepted bid awaiting payment; returns the client secret for the future
// in-app pay sheet.
paymentsRouter.post('/sponsorships/:id/pay', requireAuth, async (c) => {
  const client = getClient(c.env);
  if (!client) return c.json({ error: 'payments_not_configured' }, 503);

  const sponsorId = c.get('userId');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Not found' }, 404);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const sponsorship = await db.query.sponsorships.findFirst({
    where: eq(schema.sponsorships.id, id),
  });
  if (!sponsorship) return c.json({ error: 'Not found' }, 404);
  if (sponsorship.sponsorId !== sponsorId) return c.json({ error: 'Forbidden' }, 403);
  if (['paid', 'released', 'refunded'].includes(sponsorship.paymentStatus)) {
    return c.json({ error: `Sponsorship already ${sponsorship.paymentStatus}` }, 409);
  }
  if (sponsorship.paymentStatus !== 'requires_payment') {
    return c.json({ error: 'Sponsorship is not awaiting payment' }, 400);
  }

  // Idempotent: reuse the existing PaymentIntent while it is still payable.
  const oldId = sponsorship.paymentIntentId;
  if (oldId) {
    const existing = await client.retrievePaymentIntent(oldId);
    if (PAYABLE_INTENT_STATUSES.has(existing.status)) {
      return c.json({ clientSecret: existing.clientSecret });
    }
    if (existing.status !== 'canceled') {
      // processing / requires_capture / succeeded: payment is in flight or done
      // (the webhook will flip the row to paid). Never create a second charge.
      return c.json({ error: `Payment is ${existing.status}` }, 409);
    }
  }

  // Key is derived from the sponsorship + the PI being replaced, so concurrent
  // double-taps in the same state collapse to one PaymentIntent at Stripe.
  const intent = await client.createPaymentIntent({
    amountCents: sponsorship.amountCents,
    currency: CURRENCY,
    metadata: { sponsorshipId: sponsorship.id },
    idempotencyKey: `pay-${sponsorship.id}-${oldId ?? 'first'}`,
  });
  await db
    .update(schema.sponsorships)
    .set({ paymentIntentId: intent.id })
    .where(eq(schema.sponsorships.id, sponsorship.id));

  return c.json({ clientSecret: intent.clientSecret });
});

// POST /webhook — Stripe webhook. Gated independently on STRIPE_WEBHOOK_SECRET
// (not STRIPE_SECRET_KEY): verifying + processing events never calls back to
// the Stripe API, so it doesn't need an API key configured.
paymentsRouter.post('/webhook', async (c) => {
  const webhookSecret = stripeWebhookSecret(c.env);
  if (!webhookSecret) return c.json({ error: 'payments_not_configured' }, 503);

  const payload = await c.req.text();
  const signatureHeader = c.req.header('Stripe-Signature');
  if (!signatureHeader) return c.json({ error: 'Missing Stripe-Signature header' }, 400);

  const event = await verifyStripeSignature(payload, signatureHeader, webhookSecret);
  if (!event) return c.json({ error: 'Invalid signature' }, 400);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });

  // Two sources: "Your account" events (no `account` field) and Connect
  // events (`account` = the connected account id). Separate charges &
  // transfers puts the PaymentIntent on the PLATFORM, so payment_intent.
  // succeeded is only trusted from the platform source; a PaymentIntent on a
  // connected account is not ours. account.updated for a connected account
  // is keyed by event.account (falling back to object.id).
  //
  // Account readiness arrives two ways for a v2 account (see PAYMENTS.md):
  // v2 thin notifications (primary; no payload, re-fetch the account) and the
  // v1 snapshot `account.updated` (backup; also re-fetched when we can).
  if (event.type === 'payment_intent.succeeded') {
    if (!event.account && event.data) await handlePaymentIntentSucceeded(db, c.env.RESEND_API_KEY, event.data.object);
  } else if (event.type === 'account.updated') {
    await handleAccountUpdated(db, getClient(c.env), event.data?.object ?? {}, event.account);
  } else if (V2_ACCOUNT_REFRESH_EVENTS.has(event.type)) {
    const accountId = event.related_object?.id;
    if (accountId) await refreshAccountReadiness(db, getClient(c.env), accountId);
  }

  return c.json({ received: true });
});

async function handlePaymentIntentSucceeded(
  db: Db,
  resendApiKey: string | undefined,
  object: Record<string, unknown>,
): Promise<void> {
  const metadata = object.metadata as { sponsorshipId?: string } | undefined;
  const sponsorshipId = metadata?.sponsorshipId;
  if (!sponsorshipId) return;

  const sponsorship = await db.query.sponsorships.findFirst({
    where: eq(schema.sponsorships.id, sponsorshipId),
  });
  if (!sponsorship || sponsorship.paymentStatus === 'paid') return; // idempotent on webhook redelivery

  const [updated] = await db
    .update(schema.sponsorships)
    .set({ paymentStatus: 'paid', paidAt: new Date() })
    .where(eq(schema.sponsorships.id, sponsorshipId))
    .returning();

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, updated.eventId) });
  if (!event) return;

  const amount = fmtUsd(updated.amountCents);
  await Promise.all([
    notify(db, resendApiKey, {
      userId: updated.sponsorId,
      type: 'payment_received',
      title: `Payment received for "${event.title}"`,
      body: `Your ${amount} payment for "${event.title}" was received.`,
      eventId: event.id,
    }).catch((err) => console.error('[payments] payment_received (sponsor) notify failed:', err)),
    notify(db, resendApiKey, {
      userId: event.hostId,
      type: 'payment_received',
      title: `Sponsorship paid for "${event.title}"`,
      body: `The ${amount} sponsorship for "${event.title}" is paid. We hold it until the party is over.`,
      eventId: event.id,
    }).catch((err) => console.error('[payments] payment_received (host) notify failed:', err)),
  ]);
}

// v2 thin events that can change whether a recipient account may receive
// transfers. All are handled by re-fetching the account (thin payloads carry
// no state). account.closed makes the re-fetch report not-ready.
const V2_ACCOUNT_REFRESH_EVENTS = new Set([
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account[requirements].updated',
  'v2.core.account.closed',
]);

// Source of truth is the v2 account (recipient stripe_transfers capability).
// If no API client is available (webhook secret set but no secret key) fall
// back to the v1-shaped snapshot payload.
async function refreshAccountReadiness(
  db: Db,
  client: StripeClient | null,
  accountId: string,
  snapshot?: Record<string, unknown>,
): Promise<void> {
  let ready: boolean;
  if (client) {
    try {
      ready = (await client.getAccount(accountId)).payoutsEnabled;
    } catch (err) {
      console.error('[payments] account refresh failed for', accountId, err);
      return; // leave state unchanged; Stripe retries the webhook on 5xx only, a later event will resync
    }
  } else {
    const caps = snapshot?.capabilities as { transfers?: string } | undefined;
    ready = caps?.transfers === 'active' || (caps === undefined && !!snapshot?.payouts_enabled);
  }
  await db
    .update(schema.users)
    .set({ stripePayoutsEnabled: ready })
    .where(eq(schema.users.stripeAccountId, accountId));
}

async function handleAccountUpdated(
  db: Db,
  client: StripeClient | null,
  object: Record<string, unknown>,
  eventAccount?: string,
): Promise<void> {
  const accountId = eventAccount ?? (object.id as string | undefined);
  if (!accountId) return;
  await refreshAccountReadiness(db, client, accountId, object);
}

// POST /run-sweeps — manual trigger (ADMIN_SECRET bearer only) mirroring
// /api/notifications/run-reminders, for tests and ops.
paymentsRouter.post('/run-sweeps', requireAdmin, async (c) => {
  // Optional { sponsorshipIds: string[] } narrows the sweep to those rows
  // (tests/ops). Absent or malformed => the full sweep, as the cron runs it.
  const body = await c.req.json().catch(() => null) as { sponsorshipIds?: unknown } | null;
  const ids = Array.isArray(body?.sponsorshipIds) && body.sponsorshipIds.every((x) => typeof x === 'string')
    ? (body.sponsorshipIds as string[])
    : undefined;
  const result = await runPaymentSweeps(c.env, ids ? { sponsorshipIds: ids } : undefined);
  return c.json(result);
});

// ─── Sweeps (called from the cron scheduled() handler in index.ts) ───────────
//
// Release: paid sponsorships whose event ended >=24h ago, for hosts with
// payouts enabled -> transfer (amount - platform fee) to the host's connected
// account -> released.
// Refund: paid sponsorships whose event was cancelled -> full refund ->
// refunded.
//
// Idempotent by construction: both branches only ever act on rows still in
// paymentStatus 'paid'; once moved to released/refunded a rerun skips them.

export async function runPaymentSweeps(
  env: Env,
  opts?: { sponsorshipIds?: string[] },
): Promise<{ released: number; refunded: number }> {
  const client = getClient(env);
  if (!client) return { released: 0, refunded: 0 }; // graceful no-op, unconfigured

  const db = drizzle(neon(env.DATABASE_URL), { schema });
  const scope = opts?.sponsorshipIds;
  if (scope && scope.length === 0) return { released: 0, refunded: 0 };
  const paid = await db.query.sponsorships.findMany({
    where: scope
      ? and(eq(schema.sponsorships.paymentStatus, 'paid'), inArray(schema.sponsorships.id, scope))
      : eq(schema.sponsorships.paymentStatus, 'paid'),
  });
  if (paid.length === 0) return { released: 0, refunded: 0 };

  const eventIds = [...new Set(paid.map((s) => s.eventId))];
  const events = await db.query.events.findMany({ where: inArray(schema.events.id, eventIds) });
  const eventById = new Map(events.map((e) => [e.id, e]));

  const hostIds = [...new Set(events.map((e) => e.hostId))];
  const hosts = hostIds.length
    ? await db.query.users.findMany({ where: inArray(schema.users.id, hostIds) })
    : [];
  const hostById = new Map(hosts.map((h) => [h.id, h]));

  let released = 0;
  let refunded = 0;
  const now = Date.now();

  for (const sponsorship of paid) {
    const event = eventById.get(sponsorship.eventId);
    if (!event) continue;

    if (event.status === 'cancelled') {
      if (!sponsorship.paymentIntentId) continue;
      try {
        await client.createRefund({ paymentIntentId: sponsorship.paymentIntentId });
        await db
          .update(schema.sponsorships)
          .set({ paymentStatus: 'refunded' })
          .where(and(eq(schema.sponsorships.id, sponsorship.id), eq(schema.sponsorships.paymentStatus, 'paid')));
        await notify(db, env.RESEND_API_KEY, {
          userId: sponsorship.sponsorId,
          type: 'payment_refunded',
          title: `Refund issued for "${event.title}"`,
          body: `Your ${fmtUsd(sponsorship.amountCents)} sponsorship for "${event.title}" was refunded because the event was cancelled.`,
          eventId: event.id,
        }).catch((err) => console.error('[payments] payment_refunded notify failed:', err));
        refunded += 1;
      } catch (err) {
        console.error('[payments] refund sweep failed for sponsorship', sponsorship.id, err);
      }
      continue;
    }

    if (!event.endsAt || now - event.endsAt.getTime() < RELEASE_DELAY_MS) continue;
    const host = hostById.get(event.hostId);
    if (!host?.stripePayoutsEnabled || !host.stripeAccountId) continue;

    try {
      const transferAmountCents = sponsorship.amountCents - sponsorship.platformFeeCents;
      const transfer = await client.createTransfer({
        amountCents: transferAmountCents,
        currency: CURRENCY,
        destination: host.stripeAccountId,
        metadata: { sponsorshipId: sponsorship.id },
      });
      await db
        .update(schema.sponsorships)
        .set({ paymentStatus: 'released', releasedAt: new Date(), transferId: transfer.id })
        .where(and(eq(schema.sponsorships.id, sponsorship.id), eq(schema.sponsorships.paymentStatus, 'paid')));
      await notify(db, env.RESEND_API_KEY, {
        userId: event.hostId,
        type: 'payout_sent',
        title: `Payout sent for "${event.title}"`,
        body: `${fmtUsd(transferAmountCents)} was transferred to your connected account for "${event.title}".`,
        eventId: event.id,
      }).catch((err) => console.error('[payments] payout_sent notify failed:', err));
      released += 1;
    } catch (err) {
      console.error('[payments] release sweep failed for sponsorship', sponsorship.id, err);
    }
  }

  return { released, refunded };
}

// ─── Public Stripe onboarding landing pages ───────────────────────────────────
// Mounted at /payments (NOT /api/payments) in index.ts. Public by design:
// nothing secret is rendered. Stripe adds no account id to the return URL.

export const onboardPagesRouter = new Hono<AppEnv>();

// Expo Router route app/app/settings.tsx (root Stack screen "settings").
export const SETTINGS_DEEP_LINK = 'spotseek://settings';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function onboardPage(opts: { title: string; body: string; ctaHref: string; ctaLabel: string; redirect?: boolean }): string {
  const href = escapeHtml(opts.ctaHref);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(opts.title)} · SpotSeek</title>
${opts.redirect ? `<meta http-equiv="refresh" content="1;url=${href}">` : ''}
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F0F12;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif}
  main{width:100%;max-width:420px;border:2px solid #00e5ff;padding:32px 24px}
  h1{margin:0 0 16px;font-size:34px;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;font-weight:900}
  p{margin:0 0 28px;color:#c9c9d1;font-size:16px;line-height:1.5}
  a.cta{display:block;text-align:center;padding:16px;background:#00e5ff;color:#0F0F12;text-decoration:none;text-transform:uppercase;font-weight:800;letter-spacing:.06em;border-radius:0;box-shadow:4px 4px 0 #fff}
</style></head>
<body><main>
<h1>${escapeHtml(opts.title)}</h1>
<p>${escapeHtml(opts.body)}</p>
<a class="cta" href="${href}">${escapeHtml(opts.ctaLabel)}</a>
</main>${opts.redirect ? `<script>setTimeout(function(){location.href=${JSON.stringify(opts.ctaHref).replace(/</g, '\\u003c')}},400)</script>` : ''}</body></html>`;
}

onboardPagesRouter.get('/onboard/return', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.html(
    onboardPage({
      title: 'Payouts connected',
      body: "You're all set. Head back to SpotSeek. If anything is still needed, the app will tell you.",
      ctaHref: SETTINGS_DEEP_LINK,
      ctaLabel: 'Open SpotSeek',
      redirect: true,
    }),
  );
});

function onboardFallbackPage(): string {
  return onboardPage({
    title: 'Link expired',
    body: 'This onboarding link is no longer valid. Open the SpotSeek app and tap "Set up payouts" again.',
    ctaHref: SETTINGS_DEEP_LINK,
    ctaLabel: 'Open SpotSeek',
  });
}

onboardPagesRouter.get('/onboard/refresh', async (c) => {
  c.header('Cache-Control', 'no-store');
  const accountId = c.req.query('account');
  const client = getClient(c.env);
  if (!accountId || !client) return c.html(onboardFallbackPage());

  // Only regenerate for accounts we created (belongs to a user row).
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({ where: eq(schema.users.stripeAccountId, accountId) });
  if (!user) return c.html(onboardFallbackPage());

  try {
    const base = publicBaseUrl(c.env);
    const link = await client.createAccountLink(
      accountId,
      `${base}/payments/onboard/refresh?account=${encodeURIComponent(accountId)}`,
      `${base}/payments/onboard/return`,
    );
    return c.redirect(link.url, 302);
  } catch (err) {
    console.error('[payments] onboard refresh failed:', err);
    return c.html(onboardFallbackPage());
  }
});
