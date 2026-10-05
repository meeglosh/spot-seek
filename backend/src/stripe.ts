/**
 * Minimal fetch-based Stripe REST client (no `stripe` SDK — Workers-friendly).
 * Test-mode only, per PAYMENTS.md / CLAUDE.md non-negotiables. There is no
 * live key anywhere in this repo; `realStripe()` is exercised in tests only
 * against `fetchMock`-intercepted requests (see test/payments.spec.ts).
 *
 * Interface-first: callers depend on `StripeClient`, not on this file's
 * internals, so a fake implementation can be swapped in for tests without
 * touching route code.
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-06-20';
// Accounts v2 (/v2/core/*) is versioned separately; the GA version string
// shown in the current docs (docs.stripe.com/api/v2/core/accounts/create).
const STRIPE_API_BASE_V2 = 'https://api.stripe.com/v2';
const STRIPE_V2_API_VERSION = '2026-09-30.endive';

export type StripeAccount = { id: string; payoutsEnabled: boolean };
export type StripePaymentIntent = { id: string; clientSecret: string };
export type StripePaymentIntentState = StripePaymentIntent & { status: string };
export type StripeTransfer = { id: string };
export type StripeRefund = { id: string };
// Two payload styles share this type:
//  - snapshot (v1) events: `data.object` holds the resource; `account` is
//    present only on events from a "Connected accounts" destination.
//  - thin (v2) event notifications: no `data`; `related_object.id` is the
//    resource id (e.g. the v2 account) and the resource must be re-fetched.
export type StripeEvent = {
  id?: string;
  account?: string;
  type: string;
  data?: { object: Record<string, unknown> };
  related_object?: { id: string; type?: string; url?: string };
};

export type StripeClient = {
  // Accounts v2 recipient account (receives platform transfers).
  createAccount(params?: { email?: string; displayName?: string }): Promise<{ id: string }>;
  createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>;
  getAccount(accountId: string): Promise<StripeAccount>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata: Record<string, string>;
    // Sent as the Stripe `Idempotency-Key` header so retries/double-taps with
    // the same key return the same PaymentIntent instead of creating another.
    idempotencyKey?: string;
  }): Promise<StripePaymentIntent>;
  retrievePaymentIntent(id: string): Promise<StripePaymentIntentState>;
  createTransfer(params: {
    amountCents: number;
    currency: string;
    destination: string;
    metadata?: Record<string, string>;
  }): Promise<StripeTransfer>;
  createRefund(params: { paymentIntentId: string }): Promise<StripeRefund>;
  // Verifies the Stripe-Signature header and parses the payload. Returns null
  // on any verification failure (bad signature, stale timestamp, bad JSON).
  constructWebhookEvent(payload: string, signatureHeader: string, secret: string): Promise<StripeEvent | null>;
};

// ─── Form encoding (Stripe's API is application/x-www-form-urlencoded, with
// nested objects flattened using bracket notation, e.g. metadata[foo]=bar) ──

function encodeForm(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const paramKey = prefix ? `${prefix}[${key}]` : key;
      if (typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, paramKey);
      } else {
        pairs.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
      }
    }
  };
  walk(params, '');
  return pairs.join('&');
}

async function stripeRequest(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? encodeForm(params ?? {}) : undefined,
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof body?.error === 'object' && body.error && 'message' in body.error
        ? String((body.error as { message?: unknown }).message)
        : JSON.stringify(body);
    throw new Error(`Stripe error ${res.status}: ${message}`);
  }
  return body;
}

// Accounts v2 speaks JSON (not form encoding) under /v2 with its own version.
async function stripeV2Request(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  query?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API_BASE_V2}${path}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_V2_API_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof json?.error === 'object' && json.error && 'message' in json.error
        ? String((json.error as { message?: unknown }).message)
        : JSON.stringify(json);
    throw new Error(`Stripe error ${res.status}: ${message}`);
  }
  return json;
}

// A v2 recipient account can receive /v1/transfers once its
// configuration.recipient...stripe_transfers capability is `active`.
// Requires the account to have been fetched with include=configuration.recipient.
export function v2AccountCanReceiveTransfers(acct: Record<string, unknown>): boolean {
  if (acct.closed === true) return false;
  const status = (
    acct as {
      configuration?: {
        recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } };
      };
    }
  ).configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return status === 'active';
}

// ─── Webhook signature verification (Stripe's v1 scheme) ─────────────────────
// HMAC-SHA256 of `${timestamp}.${payload}` with the webhook secret, compared
// (constant-time) against the `v1` signature(s) in the Stripe-Signature
// header. 5-minute tolerance on the timestamp. Pure Web Crypto — no SDK.

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string | string[],
  toleranceSeconds = 5 * 60,
): Promise<StripeEvent | null> {
  // STRIPE_WEBHOOK_SECRET may hold several comma-separated signing secrets
  // (one per webhook destination); valid if it verifies against any of them.
  const secrets = (Array.isArray(secret) ? secret : secret.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
  if (secrets.length === 0) return null;

  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split('=');
    if (!k || v === undefined) return acc;
    (acc[k] ??= []).push(v);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const candidateSigs = parts.v1 ?? [];
  if (!timestamp || candidateSigs.length === 0) return null;

  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return null;
  if (Math.abs(Date.now() / 1000 - tsSeconds) > toleranceSeconds) return null;

  const signed = new TextEncoder().encode(`${timestamp}.${payload}`);
  let valid = false;
  for (const sec of secrets) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sec),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expected = bufferToHex(await crypto.subtle.sign('HMAC', key, signed));
    if (candidateSigs.some((sig) => timingSafeEqualHex(sig, expected))) valid = true;
  }
  if (!valid) return null;

  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}

// ─── Real implementation ──────────────────────────────────────────────────────

export function realStripe(secretKey: string): StripeClient {
  return {
    async createAccount(params) {
      // Accounts v2: recipient configuration + Stripe-balance transfers
      // (separate charges & transfers). Express dashboard = Stripe-hosted
      // Express-like experience. Platform owns fees and losses (losses_collector
      // 'application' requires fees_collector 'application').
      const acct = await stripeV2Request(secretKey, 'POST', '/core/accounts', {
        ...(params?.email ? { contact_email: params.email } : {}),
        ...(params?.displayName ? { display_name: params.displayName } : {}),
        identity: { country: 'us' },
        dashboard: 'express',
        defaults: {
          currency: 'usd',
          responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        include: ['configuration.recipient', 'defaults'],
      });
      return { id: acct.id as string };
    },

    async createAccountLink(accountId, refreshUrl, returnUrl) {
      const link = await stripeV2Request(secretKey, 'POST', '/core/account_links', {
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      });
      return { url: link.url as string };
    },

    async getAccount(accountId) {
      const acct = await stripeV2Request(
        secretKey,
        'GET',
        `/core/accounts/${accountId}`,
        undefined,
        'include%5B0%5D=configuration.recipient',
      );
      return { id: acct.id as string, payoutsEnabled: v2AccountCanReceiveTransfers(acct) };
    },

    async createPaymentIntent({ amountCents, currency, metadata, idempotencyKey }) {
      const pi = await stripeRequest(
        secretKey,
        'POST',
        '/payment_intents',
        { amount: amountCents, currency, metadata },
        idempotencyKey,
      );
      return { id: pi.id as string, clientSecret: pi.client_secret as string };
    },

    async retrievePaymentIntent(id) {
      const pi = await stripeRequest(secretKey, 'GET', `/payment_intents/${encodeURIComponent(id)}`);
      return { id: pi.id as string, clientSecret: pi.client_secret as string, status: pi.status as string };
    },

    async createTransfer({ amountCents, currency, destination, metadata }) {
      const tr = await stripeRequest(secretKey, 'POST', '/transfers', {
        amount: amountCents,
        currency,
        destination,
        metadata,
      });
      return { id: tr.id as string };
    },

    async createRefund({ paymentIntentId }) {
      const rf = await stripeRequest(secretKey, 'POST', '/refunds', { payment_intent: paymentIntentId });
      return { id: rf.id as string };
    },

    async constructWebhookEvent(payload, signatureHeader, secret) {
      return verifyStripeSignature(payload, signatureHeader, secret);
    },
  };
}
