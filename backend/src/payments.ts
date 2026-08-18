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
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
import { notify } from './notifications';
import { realStripe, verifyStripeSignature } from './stripe';
import type { StripeClient } from './stripe';

// The fee itself is computed once and stored on sponsorships.platformFeeCents
// at bid time (sponsors.ts PLATFORM_FEE_RATE) — payments only ever reads it
// back to size the transfer, so no rate constant is needed here.
const CURRENCY = 'usd';
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

function getClient(env: Env): StripeClient | null {
  const key = stripeSecretKey(env);
  return key ? realStripe(key) : null;
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

// POST /connect/onboard (host) — creates/reuses a Stripe Connect Express
// account and returns a fresh account-link URL for Stripe-hosted onboarding.
paymentsRouter.post('/connect/onboard', requireAuth, async (c) => {
  const client = getClient(c.env);
  if (!client) return c.json({ error: 'payments_not_configured' }, 503);

  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return c.json({ error: 'Not found' }, 404);

  let accountId = user.stripeAccountId;
  if (!accountId) {
    const account = await client.createAccount();
    accountId = account.id;
    await db.update(schema.users).set({ stripeAccountId: accountId }).where(eq(schema.users.id, userId));
  }

  const base = c.env.BETTER_AUTH_URL ?? 'http://localhost:8787';
  const link = await client.createAccountLink(
    accountId,
    `${base}/payments/onboard/refresh`,
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
  return c.json({
    accountId: user?.stripeAccountId ?? null,
    payoutsEnabled: user?.stripePayoutsEnabled ?? false,
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
  if (sponsorship.paymentStatus !== 'requires_payment') {
    return c.json({ error: 'Sponsorship is not awaiting payment' }, 400);
  }

  const intent = await client.createPaymentIntent({
    amountCents: sponsorship.amountCents,
    currency: CURRENCY,
    metadata: { sponsorshipId: sponsorship.id },
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

  if (event.type === 'payment_intent.succeeded') {
    await handlePaymentIntentSucceeded(db, c.env.RESEND_API_KEY, event.data.object);
  } else if (event.type === 'account.updated') {
    await handleAccountUpdated(db, event.data.object);
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
      body: `The ${amount} sponsorship for "${event.title}" has been paid and is held until after the event.`,
      eventId: event.id,
    }).catch((err) => console.error('[payments] payment_received (host) notify failed:', err)),
  ]);
}

async function handleAccountUpdated(db: Db, object: Record<string, unknown>): Promise<void> {
  const accountId = object.id as string | undefined;
  if (!accountId) return;
  await db
    .update(schema.users)
    .set({ stripePayoutsEnabled: !!object.payouts_enabled })
    .where(eq(schema.users.stripeAccountId, accountId));
}

// POST /run-sweeps — manual trigger (authed) mirroring
// /api/notifications/run-reminders, for tests and ops.
paymentsRouter.post('/run-sweeps', requireAuth, async (c) => {
  const result = await runPaymentSweeps(c.env);
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

export async function runPaymentSweeps(env: Env): Promise<{ released: number; refunded: number }> {
  const client = getClient(env);
  if (!client) return { released: 0, refunded: 0 }; // graceful no-op, unconfigured

  const db = drizzle(neon(env.DATABASE_URL), { schema });
  const paid = await db.query.sponsorships.findMany({ where: eq(schema.sponsorships.paymentStatus, 'paid') });
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
